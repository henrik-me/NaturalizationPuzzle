using Microsoft.EntityFrameworkCore;
using NaturalizationPuzzle.Api.Data;
using NaturalizationPuzzle.Api.Services;

namespace NaturalizationPuzzle.Api.Tests;

public sealed class QuestionServiceTests : IDisposable
{
    private readonly AppDbContext _db;
    private readonly QuestionService _sut;

    public QuestionServiceTests()
    {
        var options = new DbContextOptionsBuilder<AppDbContext>()
            .UseInMemoryDatabase(Guid.NewGuid().ToString())
            .Options;

        _db = new AppDbContext(options);
        _db.Database.EnsureCreated();
        _sut = new QuestionService(_db);
    }

    [Fact]
    public async Task GetAllQuestionsAsync_Returns128Questions()
    {
        var questions = await _sut.GetAllQuestionsAsync(null, CancellationToken.None);
        Assert.Equal(128, questions.Count);
    }

    [Fact]
    public async Task GetQuestionByIdAsync_ReturnsQuestion_WhenExists()
    {
        var question = await _sut.GetQuestionByIdAsync(1, null, CancellationToken.None);
        Assert.NotNull(question);
        Assert.Equal("What is the form of government of the United States?", question.Text);
    }

    [Fact]
    public async Task GetQuestionByIdAsync_ReturnsNull_WhenNotExists()
    {
        var question = await _sut.GetQuestionByIdAsync(999, null, CancellationToken.None);
        Assert.Null(question);
    }

    [Fact]
    public async Task Get6520QuestionsAsync_Returns20Questions()
    {
        var questions = await _sut.Get6520QuestionsAsync(null, CancellationToken.None);
        Assert.Equal(20, questions.Count);
        Assert.All(questions, q => Assert.True(q.Is6520Designated));
    }

    [Fact]
    public async Task GetQuestionsByCategoryAsync_FiltersCorrectly()
    {
        var questions = await _sut.GetQuestionsByCategoryAsync("American History", null, CancellationToken.None);
        Assert.All(questions, q => Assert.Equal("American History", q.Category));
        Assert.NotEmpty(questions);
    }

    [Fact]
    public async Task GetAllQuestionsAsync_WithState_ResolvesStateSpecificAnswers()
    {
        _db.States.Add(new Models.UsState
        {
            Id = 100,
            Name = "Test State",
            Abbreviation = "TS",
            Capital = "Test City",
            Governor = "Jane Doe",
            SenatorOne = "John Smith",
            SenatorTwo = "Mary Jones",
            Representative = "Bob Lee"
        });
        await _db.SaveChangesAsync();

        var questions = await _sut.GetAllQuestionsAsync(100, CancellationToken.None);

        var q23 = questions.First(q => q.Id == 23);
        Assert.Contains("John Smith", q23.Answers);
        Assert.Contains("Mary Jones", q23.Answers);

        var q61 = questions.First(q => q.Id == 61);
        Assert.Contains("Jane Doe", q61.Answers);

        var q62 = questions.First(q => q.Id == 62);
        Assert.Contains("Test City", q62.Answers);
    }

    [Fact]
    public async Task GetAllQuestionsAsync_AlwaysReturnsTagList_NeverNull()
    {
        var questions = await _sut.GetAllQuestionsAsync(null, CancellationToken.None);
        Assert.All(questions, q => Assert.NotNull(q.Tags));
    }

    [Theory]
    [InlineData("documents:Constitution", new[] { 2, 3, 4, 5, 7, 10, 14, 60, 63, 82, 97 })]
    [InlineData("documents:Bill of Rights", new[] { 6 })]
    [InlineData("documents:Declaration of Independence", new[] { 8, 9, 10, 11, 78, 79 })]
    [InlineData("documents:Federalist Papers", new[] { 83, 84 })]
    [InlineData("documents:Emancipation Proclamation", new[] { 95 })]
    [InlineData("people:George Washington", new[] { 86 })]
    [InlineData("people:Thomas Jefferson", new[] { 78, 87 })]
    [InlineData("people:Benjamin Franklin", new[] { 85 })]
    [InlineData("people:James Madison", new[] { 88 })]
    [InlineData("people:Alexander Hamilton", new[] { 89 })]
    [InlineData("people:Abraham Lincoln", new[] { 94 })]
    [InlineData("people:Dwight Eisenhower", new[] { 107 })]
    [InlineData("people:Martin Luther King, Jr.", new[] { 113 })]
    [InlineData("wars:Revolutionary War", new[] { 76, 80 })]
    [InlineData("wars:Civil War", new[] { 92, 93, 96 })]
    [InlineData("wars:World War I", new[] { 101 })]
    [InlineData("wars:World War II", new[] { 105, 106 })]
    [InlineData("wars:Cold War", new[] { 108, 109 })]
    [InlineData("wars:Korean War", new[] { 110 })]
    [InlineData("wars:Vietnam War", new[] { 111 })]
    [InlineData("wars:Persian Gulf War", new[] { 114 })]
    public async Task GetAllQuestionsAsync_TagSentinelSet_AllExpectedQuestionsCarryTag(string tag, int[] expectedIds)
    {
        var questions = await _sut.GetAllQuestionsAsync(null, CancellationToken.None);
        var actualIds = questions.Where(q => q.Tags.Contains(tag)).Select(q => q.Id).OrderBy(id => id).ToArray();
        Assert.Equal(expectedIds.OrderBy(id => id).ToArray(), actualIds);
    }

    [Theory]
    [InlineData("timePeriod:1700s", 76)]
    [InlineData("timePeriod:1800s", 90)]
    [InlineData("timePeriod:1900s", 100)]
    [InlineData("timePeriod:2000s", 115)]
    public async Task GetAllQuestionsAsync_TimePeriodTagPresent(string tag, int sampleQuestionId)
    {
        var questions = await _sut.GetAllQuestionsAsync(null, CancellationToken.None);
        var q = questions.First(x => x.Id == sampleQuestionId);
        Assert.Contains(tag, q.Tags);
    }

    [Fact]
    public async Task GetAllQuestionsAsync_AllTagsAreNamespaced()
    {
        var questions = await _sut.GetAllQuestionsAsync(null, CancellationToken.None);
        var allowedNamespaces = new HashSet<string> { "people", "wars", "documents", "timePeriod" };
        foreach (var q in questions)
        {
            foreach (var tag in q.Tags)
            {
                var idx = tag.IndexOf(':');
                Assert.True(idx > 0, $"Tag '{tag}' on Q{q.Id} is missing a namespace prefix.");
                var ns = tag[..idx];
                Assert.Contains(ns, allowedNamespaces);
            }
        }
    }

    public void Dispose() => _db.Dispose();
}
