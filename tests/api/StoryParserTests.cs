using NaturalizationPuzzle.Api.Services;
using Xunit;

namespace NaturalizationPuzzle.Api.Tests;

/// <summary>
/// Direct unit tests for <see cref="StoryParser"/> validation rules — uses
/// inline string fixtures so the rules can be exercised without committing
/// a malformed file to content/stories. Pairs with <see cref="StoryContentTests"/>
/// which validates the real shipped pilot stories.
/// </summary>
public sealed class StoryParserTests
{
    private const string MinimalFrontmatter = """
        ---
        slug: test
        title: Test Story
        category: American Government
        subCategory: System of Government
        questionIds: [15]
        readingLevelMin: 1
        ---
        ## Heading

        A paragraph with a citation [1].
        """;

    private static string SourcesJson(string url) =>
        $$"""
        {
          "sources": [
            { "id": 1, "title": "T", "url": "{{url}}", "type": "wikipedia", "supportSnippet": "snip snip" }
          ]
        }
        """;

    [Fact]
    public void Parse_AcceptsHttpsSourceUrl()
    {
        var story = StoryParser.Parse("test", MinimalFrontmatter, SourcesJson("https://en.wikipedia.org/wiki/Test"));
        Assert.Single(story.Sources);
        Assert.Equal("https://en.wikipedia.org/wiki/Test", story.Sources[0].Url);
    }

    [Fact]
    public void Parse_AcceptsHttpSourceUrl()
    {
        var story = StoryParser.Parse("test", MinimalFrontmatter, SourcesJson("http://example.gov/x"));
        Assert.Single(story.Sources);
    }

    [Fact]
    public void Parse_AcceptsMailtoSourceUrl()
    {
        var story = StoryParser.Parse("test", MinimalFrontmatter, SourcesJson("mailto:archives@example.gov"));
        Assert.Single(story.Sources);
    }

    [Theory]
    [InlineData("javascript:alert(1)")]
    [InlineData("data:text/html,<script>alert(1)</script>")]
    [InlineData("vbscript:msgbox(1)")]
    [InlineData("file:///etc/passwd")]
    [InlineData("ftp://example.com/x")]
    public void Parse_RejectsUnsafeSourceUrlSchemes(string unsafeUrl)
    {
        // Final-diff review fix #1: unsafe schemes in source URLs must fail at
        // parse time so they cannot reach the client (where StoryPage renders
        // s.url into a raw href). Defense in depth, paired with isSafeSourceUrl
        // on the client.
        var ex = Assert.Throws<StoryValidationException>(() =>
            StoryParser.Parse("test", MinimalFrontmatter, SourcesJson(unsafeUrl)));
        Assert.Contains("disallowed scheme", ex.Message);
    }

    [Fact]
    public void Parse_RejectsEmptySourceUrl()
    {
        var ex = Assert.Throws<StoryValidationException>(() =>
            StoryParser.Parse("test", MinimalFrontmatter, SourcesJson("")));
        Assert.Contains("empty url", ex.Message);
    }

    [Fact]
    public void Parse_RejectsRelativeOrPathOnlySourceUrl()
    {
        // Cross-platform note: `Uri.TryCreate("/relative/path", UriKind.Absolute, ...)`
        // returns false on Windows but true (with `file:` scheme) on Linux .NET.
        // Either way the parser rejects: Windows hits the "not absolute" branch,
        // Linux hits the "disallowed scheme 'file'" branch. Both are correct.
        var ex = Assert.Throws<StoryValidationException>(() =>
            StoryParser.Parse("test", MinimalFrontmatter, SourcesJson("/relative/path")));
        Assert.True(
            ex.Message.Contains("not absolute") || ex.Message.Contains("disallowed scheme"),
            $"Expected 'not absolute' or 'disallowed scheme' in: {ex.Message}");
    }

    [Fact]
    public void Parse_RejectsBareWord_AsSourceUrl()
    {
        var ex = Assert.Throws<StoryValidationException>(() =>
            StoryParser.Parse("test", MinimalFrontmatter, SourcesJson("not-a-url")));
        Assert.Contains("not absolute", ex.Message);
    }

    [Fact]
    public void Parse_StripsHtmlCommentMarkersFromBody()
    {
        // Final-diff Copilot review fix: the renderer no longer strips HTML
        // comments — the parser does so, robustly. Verify markers don't reach
        // BodyMarkdown.
        const string mdWithMarkers = """
            ---
            slug: test
            title: T
            category: American Government
            subCategory: System of Government
            questionIds: [15]
            readingLevelMin: 1
            ---
            <!-- narrative -->
            Opening scene.

            <!-- model-memory -->
            A paragraph.
            """;
        var story = StoryParser.Parse("test", mdWithMarkers, SourcesJson("https://example.gov/x"));
        Assert.DoesNotContain("<!--", story.BodyMarkdown);
        Assert.DoesNotContain("-->", story.BodyMarkdown);
        // The model-memory marker was present, so the flag must still be true.
        Assert.True(story.ModelMemoryUsed);
    }

    [Fact]
    public void Parse_StripsInterleavedHtmlCommentsRobustly()
    {
        // Defense in depth: even pathological "<!-- a <!-- b -->" inputs leave
        // no leading "<!--" behind. The parser's loop guarantees stability.
        const string mdWithEvilMarkers = """
            ---
            slug: test
            title: T
            category: American Government
            subCategory: System of Government
            questionIds: [15]
            readingLevelMin: 1
            ---
            <!-- a <!-- b -->
            A paragraph with citation [1].
            """;
        var story = StoryParser.Parse("test", mdWithEvilMarkers, SourcesJson("https://example.gov/x"));
        Assert.DoesNotContain("<!--", story.BodyMarkdown);
        Assert.DoesNotContain("-->", story.BodyMarkdown);
    }

    [Fact]
    public void Parse_FrontmatterIntegerTypoThrowsStoryValidationException()
    {
        // Final-diff Copilot review fix: int.Parse/bool.Parse used to bubble
        // a FormatException without slug context. Now wrapped.
        const string md = """
            ---
            slug: test
            title: T
            category: American Government
            subCategory: System of Government
            questionIds: [15]
            estReadMinutes: not-a-number
            readingLevelMin: 1
            ---
            A paragraph [1].
            """;
        var ex = Assert.Throws<StoryValidationException>(() =>
            StoryParser.Parse("test", md, SourcesJson("https://example.gov/x")));
        Assert.Contains("estReadMinutes", ex.Message);
        Assert.Contains("must be an integer", ex.Message);
    }

    [Fact]
    public void Parse_RejectsMalformedSourcesJson()
    {
        var ex = Assert.Throws<StoryValidationException>(() =>
            StoryParser.Parse("test", MinimalFrontmatter, "{ this is not json"));
        Assert.Contains("not valid JSON", ex.Message);
    }

    [Fact]
    public void Parse_RejectsSourcesJson_MissingRequiredProperty()
    {
        // 'supportSnippet' is required — Copilot flagged that the original
        // ParseSources called GetProperty(...) directly, throwing
        // KeyNotFoundException without slug context.
        const string sourcesMissingSnippet = """
            {
              "sources": [
                { "id": 1, "title": "T", "url": "https://example.gov/x", "type": "gov" }
              ]
            }
            """;
        var ex = Assert.Throws<StoryValidationException>(() =>
            StoryParser.Parse("test", MinimalFrontmatter, sourcesMissingSnippet));
        Assert.Contains("supportSnippet", ex.Message);
    }

    [Fact]
    public void Parse_RejectsSourcesJson_PropertyOfWrongType()
    {
        const string sourcesIdAsString = """
            {
              "sources": [
                { "id": "not-a-number", "title": "T", "url": "https://example.gov/x", "type": "gov", "supportSnippet": "snip" }
              ]
            }
            """;
        var ex = Assert.Throws<StoryValidationException>(() =>
            StoryParser.Parse("test", MinimalFrontmatter, sourcesIdAsString));
        Assert.Contains("id", ex.Message);
    }

    [Fact]
    public void Parse_DetectsModelMemoryMarker_ToleratesWhitespaceVariation()
    {
        // Final-diff Copilot review fix (round 10): SplitParagraphs trims
        // whitespace inside <!-- ... --> when extracting the marker name,
        // but ModelMemoryUsed used to be computed via an exact-string
        // body.Contains. So a marker like "<!-- model-memory-->" (no
        // trailing space) would pass the paragraph-citation exemption
        // but silently bypass the disclosure flag. Now both code paths
        // use a tolerant regex.
        const string md = """
            ---
            slug: test
            title: T
            category: American Government
            subCategory: System of Government
            questionIds: [15]
            readingLevelMin: 1
            ---
            ## Heading

            <!--model-memory-->
            A paragraph drafted from model memory.

            A different paragraph with a citation [1].
            """;
        var story = StoryParser.Parse("test", md, SourcesJson("https://example.gov/x"));
        Assert.True(story.ModelMemoryUsed,
            "ModelMemoryUsed must be true when ANY tolerant <!-- model-memory --> marker variant is present");
    }

    [Fact]
    public void Parse_RejectsDuplicateSourceIds()
    {
        // Final-diff Copilot review fix (round 10): duplicate source ids
        // would break #story-source-{id} anchors and React list keys on the
        // client and make [N] resolution ambiguous on the server.
        const string sourcesWithDuplicateId = """
            {
              "sources": [
                { "id": 1, "title": "A", "url": "https://example.gov/a", "type": "gov", "supportSnippet": "snip" },
                { "id": 1, "title": "B", "url": "https://example.gov/b", "type": "gov", "supportSnippet": "snip" }
              ]
            }
            """;
        var ex = Assert.Throws<StoryValidationException>(() =>
            StoryParser.Parse("test", MinimalFrontmatter, sourcesWithDuplicateId));
        Assert.Contains("duplicate id", ex.Message);
    }

    [Fact]
    public void Parse_RecognizesMultiDigitOrderedListMarkers()
    {
        // Final-diff Copilot review fix: IsListOnly used to misclassify
        // '10.' as not-a-list (the old check only handled single-digit
        // markers). The parser would then demand a citation marker on a
        // list-only paragraph and fail validation.
        const string md = """
            ---
            slug: test
            title: T
            category: American Government
            subCategory: System of Government
            questionIds: [15]
            readingLevelMin: 1
            ---
            ## Heading

            A paragraph with a citation [1].

            1. first item
            10. tenth item
            100. hundredth item
            """;
        // Should parse without throwing — the multi-digit list paragraph is
        // exempt from the citation requirement because it is list-only.
        var story = StoryParser.Parse("test", md, SourcesJson("https://example.gov/x"));
        Assert.NotNull(story);
    }

    [Fact]
    public void Parse_RejectsCitationMarkerWithOverflowingInteger()
    {
        // Final-diff Copilot review fix (round 11): ValidateCitationsResolve
        // used int.Parse, which throws OverflowException (uncaught -> 500)
        // for pathologically large markers like '[99999999999999]'. Now
        // wrapped in StoryValidationException with slug context.
        const string md = """
            ---
            slug: test
            title: T
            category: American Government
            subCategory: System of Government
            questionIds: [15]
            readingLevelMin: 1
            ---
            ## Heading

            A paragraph with a huge citation [99999999999999].
            """;
        var ex = Assert.Throws<StoryValidationException>(() =>
            StoryParser.Parse("test", md, SourcesJson("https://example.gov/x")));
        Assert.Contains("citation marker", ex.Message);
        Assert.Contains("not a valid integer", ex.Message);
    }
}
