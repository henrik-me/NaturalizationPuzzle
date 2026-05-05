using Microsoft.EntityFrameworkCore;
using NaturalizationPuzzle.Api.Data;
using NaturalizationPuzzle.Api.Services;

namespace NaturalizationPuzzle.Api.Tests;

public sealed class StoryServiceTests : IDisposable
{
    private readonly AppDbContext _db;
    private readonly StoryService _sut;

    public StoryServiceTests()
    {
        var options = new DbContextOptionsBuilder<AppDbContext>()
            .UseInMemoryDatabase(Guid.NewGuid().ToString())
            .Options;

        _db = new AppDbContext(options);
        _db.Database.EnsureCreated();
        _sut = new StoryService(new QuestionService(_db));
    }

    [Fact]
    public async Task ListAsync_ReturnsAllPilotStories()
    {
        var stories = await _sut.ListAsync(CancellationToken.None);
        Assert.Equal(3, stories.Count);
        Assert.Contains(stories, s => s.Slug == "three-branches");
        Assert.Contains(stories, s => s.Slug == "civil-war-and-reconstruction");
        Assert.Contains(stories, s => s.Slug == "national-symbols-and-holidays");
    }

    [Fact]
    public async Task ListAsync_ListItemDtoCarriesQuestionCount()
    {
        var stories = await _sut.ListAsync(CancellationToken.None);
        foreach (var s in stories)
        {
            Assert.True(s.QuestionCount > 0, $"Story '{s.Slug}' should have a positive QuestionCount");
        }
    }

    [Fact]
    public async Task GetAsync_ReturnsNull_WhenSlugIsUnknown()
    {
        var story = await _sut.GetAsync("does-not-exist", null, CancellationToken.None);
        Assert.Null(story);
    }

    [Fact]
    public async Task GetAsync_ReturnsStory_WithEmbeddedQuestions()
    {
        var story = await _sut.GetAsync("national-symbols-and-holidays", null, CancellationToken.None);
        Assert.NotNull(story);
        Assert.NotEmpty(story.Questions);
        // Q121 ("Why does the flag have 13 stripes?") must be in the embedded set.
        Assert.Contains(story.Questions, q => q.Id == 121);
    }

    [Fact]
    public async Task GetAsync_ResolvesStateAwareAnswers_WhenStateIdProvided()
    {
        // Plan-review fix #1: this is the real validation that the state-aware path
        // works end-to-end through StoryService -> IQuestionService -> SeedData.
        // California has SenatorOne / SenatorTwo populated in the state seed.
        var california = _db.States.Single(s => s.Abbreviation == "CA");

        var story = await _sut.GetAsync("three-branches", california.Id, CancellationToken.None);

        Assert.NotNull(story);
        var q23 = story.Questions.Single(q => q.Id == 23); // your state's senator
        Assert.NotEmpty(q23.Answers);
        Assert.All(q23.Answers, a =>
        {
            Assert.False(string.IsNullOrWhiteSpace(a),
                "Q23 answer must not be empty when stateId is provided");
            Assert.DoesNotContain("vary by state", a, StringComparison.OrdinalIgnoreCase);
        });
    }

    [Fact]
    public async Task GetAsync_DetailDto_PreservesMarkdownAndSources()
    {
        var story = await _sut.GetAsync("three-branches", null, CancellationToken.None);
        Assert.NotNull(story);
        Assert.Contains("[1]", story.BodyMarkdown);          // markers preserved
        Assert.NotEmpty(story.Sources);
        Assert.Contains(story.Sources, s => s.Id == 1);      // [1] resolves
        Assert.All(story.Sources, s => Assert.False(string.IsNullOrWhiteSpace(s.SupportSnippet)));
    }

    [Fact]
    public async Task GetAsync_StateAwareFlag_IsPropagatedToDto()
    {
        var threeBranches = await _sut.GetAsync("three-branches", null, CancellationToken.None);
        Assert.NotNull(threeBranches);
        Assert.True(threeBranches.StateAwarePreamble);

        var symbols = await _sut.GetAsync("national-symbols-and-holidays", null, CancellationToken.None);
        Assert.NotNull(symbols);
        Assert.False(symbols.StateAwarePreamble);
    }

    [Fact]
    public void GetAllStories_IsMemoized_AcrossMultipleCalls()
    {
        var first = _sut.GetAllStories();
        var second = _sut.GetAllStories();
        // Lazy<T> with isThreadSafe:true returns the same instance on every call.
        Assert.Same(first, second);
    }

    public void Dispose() => _db.Dispose();
}
