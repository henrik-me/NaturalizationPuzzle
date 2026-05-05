using System.Text;
using System.Text.Json;
using System.Text.RegularExpressions;
using NaturalizationPuzzle.Api.Models;

namespace NaturalizationPuzzle.Api.Services;

/// <summary>
/// Parses an embedded story Markdown file plus its sources.json companion into
/// a validated <see cref="Story"/>. Enforces the authoring rules captured in
/// the Story Mode plan (paragraph-level citations, source-snippet presence,
/// citation-marker resolution, Flesch-Kincaid floor, model-memory flag).
/// Throws <see cref="StoryValidationException"/> on any rule violation; this
/// fails the test suite, which is the enforcement layer.
/// </summary>
internal static class StoryParser
{
    private static readonly Regex CitationMarker = new(@"\[(\d+)\]", RegexOptions.Compiled);
    private static readonly Regex VowelGroup = new(@"[aeiouy]+", RegexOptions.Compiled | RegexOptions.IgnoreCase);
    private const string ModelMemoryMarker = "<!-- model-memory -->";
    private const string NarrativeMarker = "<!-- narrative -->";

    public static Story Parse(string slug, string markdown, string sourcesJson)
    {
        var (frontmatterText, body) = SplitFrontmatter(slug, markdown);
        var fm = ParseFrontmatter(slug, frontmatterText);
        var sources = ParseSources(slug, sourcesJson);

        ValidateCitationsResolve(slug, body, sources);
        ValidateSourceSnippets(slug, sources);
        ValidateParagraphCitations(slug, body);

        var modelMemory = body.Contains(ModelMemoryMarker, StringComparison.Ordinal);
        var fre = ComputeFleschReadingEase(body);
        var minLevel = fm.ReadingLevelMin ?? 70;
        if (fre < minLevel)
        {
            throw new StoryValidationException(
                slug, $"Flesch Reading Ease score {fre} is below required minimum {minLevel}");
        }

        var wordCount = CountWords(body);
        var estMinutes = fm.EstReadMinutes ?? Math.Max(1, (int)Math.Round(wordCount / 200.0));

        // Strip the parser-only HTML-comment markers (<!-- narrative -->,
        // <!-- model-memory -->) from the body before it leaves the server.
        // This sidesteps a CodeQL "incomplete multi-character sanitization"
        // finding on the client renderer (which previously did the strip)
        // and keeps the wire payload free of internal markup.
        var renderableBody = StripCommentMarkers(body);

        return new Story
        {
            Slug = fm.Slug ?? slug,
            Title = fm.Title ?? throw new StoryValidationException(slug, "frontmatter 'title' is required"),
            Category = fm.Category ?? throw new StoryValidationException(slug, "frontmatter 'category' is required"),
            SubCategory = fm.SubCategory ?? throw new StoryValidationException(slug, "frontmatter 'subCategory' is required"),
            BodyMarkdown = renderableBody,
            Sources = sources,
            QuestionIds = fm.QuestionIds ?? new List<int>(),
            OrphanedQuestionIds = fm.OrphanedQuestionIds ?? new List<OrphanedQuestion>(),
            EstReadMinutes = estMinutes,
            ReadingLevelMin = minLevel,
            FleschReadingEase = fre,
            ModelMemoryUsed = modelMemory,
            StateAwarePreamble = fm.StateAwarePreamble ?? false
        };
    }

    /// <summary>
    /// Robustly remove all HTML comments. A loop guarantees that nested or
    /// interleaved comment markers (`<!-- a <!-- b -->`) cannot leave a
    /// partial `<!--` behind. Validation and ModelMemoryUsed computation
    /// have already consumed the markers; the renderer should never see them.
    /// </summary>
    private static string StripCommentMarkers(string body)
    {
        var result = body;
        for (int i = 0; i < 8; i++)
        {
            var stripped = Regex.Replace(result, "<!--.*?-->", string.Empty, RegexOptions.Singleline);
            if (stripped == result)
            {
                return stripped;
            }
            result = stripped;
        }
        // After 8 passes, drop any residual marker tokens defensively.
        return result.Replace("<!--", string.Empty).Replace("-->", string.Empty);
    }

    private static (string frontmatter, string body) SplitFrontmatter(string slug, string md)
    {
        var normalized = md.Replace("\r\n", "\n");
        if (!normalized.StartsWith("---\n", StringComparison.Ordinal))
        {
            throw new StoryValidationException(slug, "missing '---' frontmatter delimiter at start of file");
        }

        var endIdx = normalized.IndexOf("\n---", 4, StringComparison.Ordinal);
        if (endIdx < 0)
        {
            throw new StoryValidationException(slug, "missing closing '---' frontmatter delimiter");
        }

        var fm = normalized.Substring(4, endIdx - 4);
        var body = normalized.Substring(endIdx + 4).TrimStart('\n');
        return (fm, body);
    }

    private sealed class Frontmatter
    {
        public string? Slug;
        public string? Title;
        public string? Category;
        public string? SubCategory;
        public int? EstReadMinutes;
        public int? ReadingLevelMin;
        public bool? StateAwarePreamble;
        public List<int>? QuestionIds;
        public List<OrphanedQuestion>? OrphanedQuestionIds;
    }

    /// <summary>
    /// Tiny YAML-ish parser tuned to the narrow shape used by Story frontmatter.
    /// Supports top-level scalars, an inline integer list (questionIds: [1, 2, 3]),
    /// and a list-of-objects (orphanedQuestionIds with id/reason pairs).
    /// </summary>
    private static Frontmatter ParseFrontmatter(string slug, string text)
    {
        var fm = new Frontmatter();
        var lines = text.Split('\n');

        for (int i = 0; i < lines.Length; i++)
        {
            var line = lines[i];
            if (string.IsNullOrWhiteSpace(line))
            {
                continue;
            }

            if (line.StartsWith("orphanedQuestionIds:", StringComparison.Ordinal))
            {
                fm.OrphanedQuestionIds = new List<OrphanedQuestion>();
                int j = i + 1;
                while (j < lines.Length)
                {
                    var l = lines[j];
                    if (string.IsNullOrWhiteSpace(l))
                    {
                        j++;
                        continue;
                    }
                    if (!l.StartsWith("  ", StringComparison.Ordinal))
                    {
                        // No longer indented under the list — back to top-level scalars.
                        break;
                    }
                    if (l.StartsWith("  - id:", StringComparison.Ordinal))
                    {
                        var idStr = l.Substring("  - id:".Length).Trim();
                        if (!int.TryParse(idStr, out var id))
                        {
                            throw new StoryValidationException(slug, $"orphanedQuestionIds: bad id '{idStr}'");
                        }
                        var reason = string.Empty;
                        if (j + 1 < lines.Length && lines[j + 1].StartsWith("    reason:", StringComparison.Ordinal))
                        {
                            reason = StripQuotes(lines[j + 1].Substring("    reason:".Length).Trim());
                            j++;
                        }
                        fm.OrphanedQuestionIds.Add(new OrphanedQuestion { Id = id, Reason = reason });
                    }
                    j++;
                }
                i = j - 1;
                continue;
            }

            int colonIdx = line.IndexOf(':');
            if (colonIdx < 0)
            {
                continue;
            }

            var key = line.Substring(0, colonIdx).Trim();
            var value = StripQuotes(line.Substring(colonIdx + 1).Trim());

            switch (key)
            {
                case "slug": fm.Slug = value; break;
                case "title": fm.Title = value; break;
                case "category": fm.Category = value; break;
                case "subCategory": fm.SubCategory = value; break;
                case "estReadMinutes":
                    fm.EstReadMinutes = ParseIntField(slug, key, value);
                    break;
                case "readingLevelMin":
                    fm.ReadingLevelMin = ParseIntField(slug, key, value);
                    break;
                case "stateAwarePreamble":
                    if (!bool.TryParse(value, out var b))
                    {
                        throw new StoryValidationException(
                            slug, $"frontmatter '{key}' must be 'true' or 'false', got '{value}'");
                    }
                    fm.StateAwarePreamble = b;
                    break;
                case "questionIds":
                    var inner = value.Trim('[', ']');
                    var parts = inner
                        .Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries);
                    var ids = new List<int>(parts.Length);
                    foreach (var p in parts)
                    {
                        if (!int.TryParse(p, out var qid))
                        {
                            throw new StoryValidationException(
                                slug, $"frontmatter 'questionIds' contains a non-integer entry: '{p}'");
                        }
                        ids.Add(qid);
                    }
                    fm.QuestionIds = ids;
                    break;
            }
        }

        return fm;
    }

    private static int ParseIntField(string slug, string key, string value)
    {
        if (!int.TryParse(value, out var n))
        {
            throw new StoryValidationException(
                slug, $"frontmatter '{key}' must be an integer, got '{value}'");
        }
        return n;
    }

    private static string StripQuotes(string s)
    {
        if (s.Length >= 2 && s[0] == '"' && s[^1] == '"')
        {
            return s[1..^1];
        }
        return s;
    }

    private static IReadOnlyList<StorySource> ParseSources(string slug, string json)
    {
        JsonDocument doc;
        try
        {
            doc = JsonDocument.Parse(json);
        }
        catch (JsonException ex)
        {
            throw new StoryValidationException(slug, $"sources.json is not valid JSON: {ex.Message}");
        }

        try
        {
            if (!doc.RootElement.TryGetProperty("sources", out var sourcesEl)
                || sourcesEl.ValueKind != JsonValueKind.Array)
            {
                throw new StoryValidationException(slug, "sources.json is missing the 'sources' array");
            }

            var sources = new List<StorySource>();
            int index = 0;
            foreach (var s in sourcesEl.EnumerateArray())
            {
                int sourceIndex = index++;
                int id = ReadRequiredInt(slug, s, "id", sourceIndex);
                string title = ReadRequiredString(slug, s, "title", sourceIndex);
                string url = ReadRequiredString(slug, s, "url", sourceIndex);
                string type = ReadRequiredString(slug, s, "type", sourceIndex);
                string supportSnippet = ReadRequiredString(slug, s, "supportSnippet", sourceIndex);

                ValidateSourceUrl(slug, url);

                sources.Add(new StorySource
                {
                    Id = id,
                    Title = title,
                    Url = url,
                    Type = type,
                    SupportSnippet = supportSnippet
                });
            }
            return sources;
        }
        finally
        {
            doc.Dispose();
        }
    }

    private static int ReadRequiredInt(string slug, JsonElement el, string property, int sourceIndex)
    {
        if (!el.TryGetProperty(property, out var p) || p.ValueKind != JsonValueKind.Number)
        {
            throw new StoryValidationException(
                slug, $"sources[{sourceIndex}] is missing required integer property '{property}'");
        }
        return p.GetInt32();
    }

    private static string ReadRequiredString(string slug, JsonElement el, string property, int sourceIndex)
    {
        if (!el.TryGetProperty(property, out var p) || p.ValueKind != JsonValueKind.String)
        {
            throw new StoryValidationException(
                slug, $"sources[{sourceIndex}] is missing required string property '{property}'");
        }
        var value = p.GetString();
        if (value is null)
        {
            throw new StoryValidationException(
                slug, $"sources[{sourceIndex}] property '{property}' is null");
        }
        return value;
    }

    /// <summary>
    /// Defense in depth (mirrors the StoryRenderer client-side guard): every
    /// source URL must use http(s) or mailto. Reject javascript:/data:/vbscript:
    /// /file:/ etc. at parse time so an unsafe URL never reaches the wire.
    /// </summary>
    private static void ValidateSourceUrl(string slug, string url)
    {
        if (string.IsNullOrWhiteSpace(url))
        {
            throw new StoryValidationException(slug, "source has empty url");
        }
        if (!Uri.TryCreate(url, UriKind.Absolute, out var parsed))
        {
            throw new StoryValidationException(slug, $"source url is not absolute: {url}");
        }
        var scheme = parsed.Scheme.ToLowerInvariant();
        if (scheme is not ("http" or "https" or "mailto"))
        {
            // Note: a relative path like "/foo/bar" parses as Absolute with the
            // "file" scheme on Linux .NET (and on Windows in some configurations).
            // It still fails this allowlist check, just with a "disallowed
            // scheme" message rather than "not absolute". Both are correct
            // rejections.
            throw new StoryValidationException(
                slug, $"source url uses disallowed scheme '{scheme}': must be http, https, or mailto");
        }
    }

    private static void ValidateCitationsResolve(string slug, string body, IReadOnlyList<StorySource> sources)
    {
        foreach (Match m in CitationMarker.Matches(body))
        {
            var id = int.Parse(m.Groups[1].Value);
            if (!sources.Any(s => s.Id == id))
            {
                throw new StoryValidationException(
                    slug, $"citation marker [{id}] has no matching source entry in sources.json");
            }
        }
    }

    private static void ValidateSourceSnippets(string slug, IReadOnlyList<StorySource> sources)
    {
        foreach (var s in sources)
        {
            if (string.IsNullOrWhiteSpace(s.SupportSnippet))
            {
                throw new StoryValidationException(
                    slug, $"source [{s.Id}] has empty supportSnippet (every source must include 1-3 sentences supporting the cited claim)");
            }
        }
    }

    /// <summary>
    /// Every body paragraph must contain a [N] citation marker OR be preceded by
    /// an explicit &lt;!-- model-memory --&gt; or &lt;!-- narrative --&gt; HTML
    /// comment marker. Headings (lines starting with #) and list-only paragraphs
    /// are exempt because their facts are covered by an adjacent paragraph's
    /// citation.
    /// </summary>
    private static void ValidateParagraphCitations(string slug, string body)
    {
        foreach (var (paragraph, precedingMarker) in SplitParagraphs(body))
        {
            if (precedingMarker is "narrative" or "model-memory")
            {
                continue;
            }
            if (paragraph.TrimStart().StartsWith("#", StringComparison.Ordinal))
            {
                continue;
            }
            if (IsListOnly(paragraph))
            {
                continue;
            }
            if (CitationMarker.IsMatch(paragraph))
            {
                continue;
            }

            var preview = paragraph.Length > 60 ? paragraph[..60] + "..." : paragraph;
            throw new StoryValidationException(
                slug,
                $"factual paragraph lacks a [N] citation marker and is not marked <!-- model-memory --> or <!-- narrative -->: \"{preview}\"");
        }
    }

    private static IEnumerable<(string paragraph, string? precedingMarker)> SplitParagraphs(string body)
    {
        var lines = body.Split('\n');
        var current = new StringBuilder();
        string? lastMarker = null;

        foreach (var line in lines)
        {
            var trimmed = line.Trim();
            if (trimmed.StartsWith("<!--", StringComparison.Ordinal) && trimmed.EndsWith("-->", StringComparison.Ordinal))
            {
                lastMarker = trimmed[4..^3].Trim();
                continue;
            }
            if (string.IsNullOrWhiteSpace(line))
            {
                if (current.Length > 0)
                {
                    yield return (current.ToString().TrimEnd(), lastMarker);
                    current.Clear();
                    lastMarker = null;
                }
                continue;
            }
            if (current.Length > 0)
            {
                current.Append('\n');
            }
            current.Append(line);
        }
        if (current.Length > 0)
        {
            yield return (current.ToString().TrimEnd(), lastMarker);
        }
    }

    private static bool IsListOnly(string paragraph)
    {
        var lines = paragraph.Split('\n');
        return lines.All(l =>
        {
            var t = l.TrimStart();
            return string.IsNullOrWhiteSpace(t)
                || t.StartsWith("- ", StringComparison.Ordinal)
                || t.StartsWith("* ", StringComparison.Ordinal)
                // Ordered-list marker: ^\d+\.\s — supports any digit width
                // (1., 10., 100., ...). The previous check `char.IsDigit(t[0])
                // && t[1] == '.'` only recognized single-digit markers and
                // misclassified `10.` as not-a-list, leading the parser to
                // demand a citation on a list-only paragraph.
                || OrderedListMarker.IsMatch(t);
        });
    }

    private static readonly Regex OrderedListMarker = new(@"^\d+\.\s+", RegexOptions.Compiled);

    /// <summary>
    /// Computes the Flesch Reading Ease score
    /// (206.835 - 1.015 * (words/sentences) - 84.6 * (syllables/words)).
    /// HIGHER values mean EASIER prose (90+ very easy, 60-70 plain English,
    /// below 30 college-level). This is NOT the Flesch-Kincaid Grade Level
    /// formula despite the loose colloquial usage of "Flesch-Kincaid"
    /// elsewhere — name and behavior must agree.
    /// </summary>
    private static int ComputeFleschReadingEase(string body)
    {
        var stripped = StripMarkdown(body);
        var words = stripped.Split(new[] { ' ', '\t', '\n', '\r' }, StringSplitOptions.RemoveEmptyEntries);
        if (words.Length == 0)
        {
            return 100;
        }
        var sentences = CountSentences(stripped);
        var syllables = words.Sum(CountSyllables);
        var score = 206.835
            - 1.015 * (words.Length / (double)sentences)
            - 84.6 * (syllables / (double)words.Length);
        return (int)Math.Round(score);
    }

    private static int CountWords(string body)
    {
        var stripped = StripMarkdown(body);
        return stripped.Split(new[] { ' ', '\t', '\n', '\r' }, StringSplitOptions.RemoveEmptyEntries).Length;
    }

    private static int CountSentences(string text)
    {
        var n = 0;
        foreach (var c in text)
        {
            if (c is '.' or '!' or '?')
            {
                n++;
            }
        }
        return Math.Max(1, n);
    }

    private static int CountSyllables(string word)
    {
        if (string.IsNullOrEmpty(word))
        {
            return 0;
        }
        var letters = new string(word.Where(char.IsLetter).ToArray()).ToLowerInvariant();
        if (letters.Length == 0)
        {
            return 0;
        }
        var n = VowelGroup.Matches(letters).Count;
        if (letters.EndsWith('e') && n > 1)
        {
            n--;
        }
        return Math.Max(1, n);
    }

    private static string StripMarkdown(string body)
    {
        var s = body;
        s = Regex.Replace(s, "<!--.*?-->", " ", RegexOptions.Singleline);
        s = Regex.Replace(s, @"\[(\d+)\]", string.Empty);                 // citation markers
        s = Regex.Replace(s, @"\[([^\]]+)\]\([^)]+\)", "$1");             // markdown links
        s = Regex.Replace(s, @"^#+\s*", string.Empty, RegexOptions.Multiline);
        s = Regex.Replace(s, @"^[-*]\s+", string.Empty, RegexOptions.Multiline);
        // Strip ordered-list markers (1., 10., ...) so they don't pollute
        // word/sentence counts in the Flesch-Kincaid score. Without this
        // strip, "1. one" was being counted as a word "1" and the trailing
        // period was inflating sentence count.
        s = Regex.Replace(s, @"^\d+\.\s+", string.Empty, RegexOptions.Multiline);
        s = Regex.Replace(s, @"\*+", string.Empty);
        s = Regex.Replace(s, @"_+", string.Empty);
        return s;
    }
}

public sealed class StoryValidationException : Exception
{
    public StoryValidationException(string slug, string message) : base($"[{slug}] {message}")
    {
        Slug = slug;
    }

    public string Slug { get; }
}
