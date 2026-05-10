using Microsoft.EntityFrameworkCore;
using NaturalizationPuzzle.Api.Data;
using NaturalizationPuzzle.Api.Models;
using NaturalizationPuzzle.Api.Services;
using Xunit;

namespace NaturalizationPuzzle.Api.Tests;

/// <summary>
/// Drives <see cref="StoryParser"/> over every embedded pilot story and
/// asserts the authoring rules from the Story Mode plan: every QuestionId
/// resolves to a real Question, the questions live in the story's declared
/// (Category, SubCategory), Flesch Reading Ease meets the per-story floor,
/// every source has a non-empty SupportSnippet, every [N] marker resolves
/// to a source, and the COVERAGE CONTRACT — every question whose
/// (Category, SubCategory) matches a story's scope is either in that
/// story's QuestionIds or in OrphanedQuestionIds (with reason).
/// </summary>
public sealed class StoryContentTests : IDisposable
{
    private readonly AppDbContext _db;
    private readonly StoryService _sut;
    private readonly QuestionService _questionService;
    private readonly ITestOutputHelper _output;

    public StoryContentTests(ITestOutputHelper output)
    {
        _output = output;
        var options = new DbContextOptionsBuilder<AppDbContext>()
            .UseInMemoryDatabase(Guid.NewGuid().ToString())
            .Options;

        _db = new AppDbContext(options);
        _db.Database.EnsureCreated();
        _questionService = new QuestionService(_db);
        _sut = new StoryService(_questionService);
    }

    [Fact]
    public void EmbeddedStories_LoadAndValidateWithoutThrowing()
    {
        var stories = _sut.GetAllStories();
        Assert.NotEmpty(stories);
    }

    [Fact]
    public void EveryStoryQuestionId_ExistsInSeedData()
    {
        var allIds = _db.Questions.Select(q => q.Id).ToHashSet();
        foreach (var story in _sut.GetAllStories())
        {
            foreach (var id in story.QuestionIds)
            {
                Assert.True(allIds.Contains(id),
                    $"Story '{story.Slug}' references non-existent QuestionId {id}");
            }
            foreach (var orphan in story.OrphanedQuestionIds)
            {
                Assert.True(allIds.Contains(orphan.Id),
                    $"Story '{story.Slug}' OrphanedQuestionIds references non-existent QuestionId {orphan.Id}");
            }
        }
    }

    /// <summary>
    /// Most QuestionIds in a story should match the story's primary
    /// (Category, SubCategory). Cross-subcategory references are allowed
    /// (multi-story membership lets a story like civil-rights-movement
    /// pull in 19th-amendment / 15th-amendment questions from "The 1800s")
    /// but should be the exception, not the norm.
    /// </summary>
    [Fact]
    public void EveryStoryQuestionId_HasMostlyMatchingCategoryAndSubCategory()
    {
        var byId = _db.Questions.ToDictionary(q => q.Id);
        foreach (var story in _sut.GetAllStories())
        {
            if (story.QuestionIds.Count == 0) continue;
            int matching = 0;
            foreach (var id in story.QuestionIds)
            {
                var q = byId[id];
                if (q.Category == story.Category && q.SubCategory == story.SubCategory)
                {
                    matching++;
                }
            }
            // At least half should match the story's primary subcategory.
            // The rest are cross-subcategory weaves intentionally pulled in.
            Assert.True(matching * 2 >= story.QuestionIds.Count,
                $"Story '{story.Slug}' has {matching}/{story.QuestionIds.Count} QuestionIds matching " +
                $"its primary ({story.Category} / {story.SubCategory}) — at least half should match.");
        }
    }

    [Fact]
    public void EveryStorySource_HasNonEmptySupportSnippet()
    {
        foreach (var story in _sut.GetAllStories())
        {
            foreach (var source in story.Sources)
            {
                Assert.False(string.IsNullOrWhiteSpace(source.SupportSnippet),
                    $"Story '{story.Slug}' source [{source.Id}] has empty SupportSnippet");
            }
        }
    }

    [Fact]
    public void EveryStory_MeetsReadingLevelMinimum()
    {
        foreach (var story in _sut.GetAllStories())
        {
            Assert.True(story.FleschReadingEase >= story.ReadingLevelMin,
                $"Story '{story.Slug}' Flesch Reading Ease={story.FleschReadingEase} below required {story.ReadingLevelMin}");
        }
    }

    [Fact]
    public void EveryStory_HasReasonableEstReadMinutes()
    {
        foreach (var story in _sut.GetAllStories())
        {
            Assert.InRange(story.EstReadMinutes, 1, 30);
        }
    }

    /// <summary>
    /// Coverage contract (post-multi-story-update): every question whose
    /// (Category, SubCategory) matches a story's scope must either be in
    /// THIS story's QuestionIds, OR in this story's OrphanedQuestionIds
    /// (with a reason), OR claimed by SOME OTHER story's QuestionIds (the
    /// post-pilot rule that lets multiple stories share a question when it
    /// fits multiple topics). The combination guarantees no in-scope
    /// question is silently dropped while letting per-story orphan lists
    /// stay short once a topic-specific story claims those questions.
    /// </summary>
    [Fact]
    public void CoverageContract_NoInScopeQuestionIsSilentlyOmitted()
    {
        var allStories = _sut.GetAllStories();
        // Build a set of every QuestionId claimed by any story (in any QuestionIds list).
        var claimedByAnyStory = allStories
            .SelectMany(s => s.QuestionIds)
            .ToHashSet();

        foreach (var story in allStories)
        {
            var inSubcategory = _db.Questions
                .Where(q => q.Category == story.Category && q.SubCategory == story.SubCategory)
                .Select(q => q.Id)
                .ToHashSet();

            var thisStoryCovers = story.QuestionIds
                .Concat(story.OrphanedQuestionIds.Select(o => o.Id))
                .ToHashSet();

            // A Q in this story's subcategory is "covered" if THIS story
            // includes it (claim or orphan), OR if some other story's
            // QuestionIds includes it.
            var missing = inSubcategory
                .Where(qid => !thisStoryCovers.Contains(qid) && !claimedByAnyStory.Contains(qid))
                .ToList();

            Assert.True(missing.Count == 0,
                $"Story '{story.Slug}' is missing {missing.Count} in-scope question(s) from " +
                $"({story.Category} / {story.SubCategory}): [{string.Join(", ", missing)}]. " +
                "Either add them to this story's QuestionIds, orphan them with a reason, " +
                "or have another story claim them.");
        }
    }

    /// <summary>
    /// Global coverage (new contract): every question in seed data must be
    /// claimed by AT LEAST ONE story's QuestionIds. Orphan lists do not
    /// count — orphan-only means "explicitly NOT covered". This is the
    /// hard guarantee that no civics question is left without any story.
    /// </summary>
    [Fact]
    public void GlobalCoverage_EveryQuestionIsClaimedByAtLeastOneStory()
    {
        var allStories = _sut.GetAllStories();
        var allClaimed = allStories.SelectMany(s => s.QuestionIds).ToHashSet();
        var allSeedIds = _db.Questions.Select(q => q.Id).ToHashSet();
        var unclaimed = allSeedIds.Except(allClaimed).OrderBy(i => i).ToList();
        Assert.True(unclaimed.Count == 0,
            $"{unclaimed.Count} question(s) are NOT claimed by any story's QuestionIds: " +
            $"[{string.Join(", ", unclaimed)}]. Add each to one or more story's QuestionIds.");
    }

    /// <summary>
    /// Informational summary — prints how many stories claim each question
    /// (via QuestionIds). Multi-story claims are encouraged when a
    /// question fits multiple topics; a question with usage count 1 has
    /// exactly one home; 0 is a coverage gap caught by GlobalCoverage above.
    /// Always passes — this is a visibility test, not an assertion.
    /// </summary>
    [Fact]
    public void CoverageSummary_PrintsUsageCountPerQuestion()
    {
        var allStories = _sut.GetAllStories();
        var usage = new Dictionary<int, List<string>>();
        foreach (var story in allStories)
        {
            foreach (var qid in story.QuestionIds)
            {
                if (!usage.TryGetValue(qid, out var list))
                {
                    list = new List<string>();
                    usage[qid] = list;
                }
                list.Add(story.Slug);
            }
        }

        var allSeedIds = _db.Questions.Select(q => q.Id).OrderBy(i => i).ToList();

        // Histogram: count -> how many questions have that usage count.
        var histogram = new SortedDictionary<int, int>();
        foreach (var id in allSeedIds)
        {
            var count = usage.TryGetValue(id, out var list) ? list.Count : 0;
            histogram.TryGetValue(count, out var bucket);
            histogram[count] = bucket + 1;
        }

        var summary = new System.Text.StringBuilder();
        summary.AppendLine($"Story Mode coverage summary across {allSeedIds.Count} seeded questions");
        summary.AppendLine("Usage count histogram (questions × stories):");
        foreach (var (count, bucket) in histogram)
        {
            summary.AppendLine($"  used by {count,2} story(ies): {bucket,3} question(s)");
        }
        summary.AppendLine();
        summary.AppendLine("Most-shared questions (used by 2+ stories):");
        var multi = usage.Where(kv => kv.Value.Count >= 2)
            .OrderByDescending(kv => kv.Value.Count)
            .ThenBy(kv => kv.Key)
            .ToList();
        if (multi.Count == 0)
        {
            summary.AppendLine("  (none)");
        }
        else
        {
            foreach (var kv in multi)
            {
                summary.AppendLine($"  Q{kv.Key,3}: {string.Join(", ", kv.Value)}");
            }
        }

        // Print to test output so `dotnet test` shows the histogram.
        _output.WriteLine(summary.ToString());

        // Always passes — informational only.
        Assert.True(true);
    }

    [Fact]
    public void EveryOrphanedQuestion_HasNonEmptyReason()
    {
        foreach (var story in _sut.GetAllStories())
        {
            foreach (var orphan in story.OrphanedQuestionIds)
            {
                Assert.False(string.IsNullOrWhiteSpace(orphan.Reason),
                    $"Story '{story.Slug}' orphaned question {orphan.Id} has empty reason");
            }
        }
    }

    [Fact]
    public void NoStory_HasOverlappingQuestionAndOrphanedSets()
    {
        foreach (var story in _sut.GetAllStories())
        {
            var orphans = story.OrphanedQuestionIds.Select(o => o.Id).ToHashSet();
            var overlap = story.QuestionIds.Intersect(orphans).ToList();
            Assert.True(overlap.Count == 0,
                $"Story '{story.Slug}' has questions in both QuestionIds and OrphanedQuestionIds: [{string.Join(", ", overlap)}]");
        }
    }

    [Fact]
    public void StoryRoster_HasExpectedSlugs()
    {
        // Sanity check the roster as it grows. As of the catalog expansion
        // following the v1 pilot, every USCIS subcategory has at least one
        // dedicated story. Update this list when a new story ships.
        var slugs = _sut.GetAllStories().Select(s => s.Slug).OrderBy(s => s, StringComparer.Ordinal).ToList();
        var expected = new[]
        {
            "civil-rights-movement",
            "civil-war-and-reconstruction",
            "cold-war-era",
            "colonial-era-and-revolution",
            "early-20th-century-and-world-wars",
            "executive-branch",
            "federalism-and-states",
            "judicial-branch",
            "legislative-branch",
            "modern-america",
            "national-symbols-and-holidays",
            "principles-of-american-democracy",
            "rights-and-responsibilities",
            "three-branches",
        };
        Assert.Equal(expected, slugs);
    }

    [Fact]
    public void EveryStorySource_UsesAllowlistedUrlScheme()
    {
        // Defense in depth (final-diff review fix #1): unsafe URL schemes in
        // sources.json (e.g. javascript:/data:/vbscript:) must not survive
        // parse, otherwise StoryPage would render them into a raw href.
        var allowed = new HashSet<string> { "http", "https", "mailto" };
        foreach (var story in _sut.GetAllStories())
        {
            foreach (var source in story.Sources)
            {
                Assert.True(Uri.TryCreate(source.Url, UriKind.Absolute, out var parsed),
                    $"Story '{story.Slug}' source [{source.Id}] url is not absolute: {source.Url}");
                Assert.True(allowed.Contains(parsed!.Scheme.ToLowerInvariant()),
                    $"Story '{story.Slug}' source [{source.Id}] uses disallowed scheme '{parsed.Scheme}'");
            }
        }
    }

    [Fact]
    public void ThreeBranchesStory_IncludesStateAwareQuestions_Q23_AndQ29()
    {
        // Plan-review fix #1: the pilot must actually exercise the state-aware
        // resolution path through IQuestionService, not just static officeholder data.
        var story = _sut.GetAllStories().Single(s => s.Slug == "three-branches");
        Assert.Contains(23, story.QuestionIds);
        Assert.Contains(29, story.QuestionIds);
        Assert.True(story.StateAwarePreamble);
    }

    public void Dispose() => _db.Dispose();
}
