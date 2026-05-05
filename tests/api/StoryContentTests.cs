using Microsoft.EntityFrameworkCore;
using NaturalizationPuzzle.Api.Data;
using NaturalizationPuzzle.Api.Models;
using NaturalizationPuzzle.Api.Services;

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

    public StoryContentTests()
    {
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
        Assert.Equal(3, stories.Count); // pilot scope: 3 stories
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

    [Fact]
    public void EveryStoryQuestionId_MatchesStoryCategoryAndSubCategory()
    {
        var byId = _db.Questions.ToDictionary(q => q.Id);
        foreach (var story in _sut.GetAllStories())
        {
            foreach (var id in story.QuestionIds)
            {
                var q = byId[id];
                Assert.Equal(story.Category, q.Category);
                Assert.Equal(story.SubCategory, q.SubCategory);
            }
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
    /// Coverage contract (per plan-review fix #3): every question whose
    /// (Category, SubCategory) matches a pilot story's scope must either be
    /// in that story's QuestionIds or in OrphanedQuestionIds with a reason.
    /// This catches silent omissions when seed data changes — a new question
    /// added to "System of Government" will fail this test until the
    /// three-branches story decides whether to include it or orphan it.
    /// </summary>
    [Fact]
    public void CoverageContract_NoInScopeQuestionIsSilentlyOmitted()
    {
        foreach (var story in _sut.GetAllStories())
        {
            var inSubcategory = _db.Questions
                .Where(q => q.Category == story.Category && q.SubCategory == story.SubCategory)
                .Select(q => q.Id)
                .ToHashSet();

            var covered = story.QuestionIds
                .Concat(story.OrphanedQuestionIds.Select(o => o.Id))
                .ToHashSet();

            var missing = inSubcategory.Except(covered).ToList();
            Assert.True(missing.Count == 0,
                $"Story '{story.Slug}' is missing {missing.Count} in-scope question(s) from " +
                $"({story.Category} / {story.SubCategory}): [{string.Join(", ", missing)}]. " +
                "Either add them to QuestionIds or orphan them with a reason.");
        }
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
    public void PilotStorySlugs_AreExactlyThePlannedThree()
    {
        var slugs = _sut.GetAllStories().Select(s => s.Slug).OrderBy(s => s).ToList();
        Assert.Equal(
            new[] { "civil-war-and-reconstruction", "national-symbols-and-holidays", "three-branches" },
            slugs);
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
