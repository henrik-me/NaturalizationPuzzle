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
    [InlineData("timePeriod:1700s", new[] { 76, 78, 79, 80, 81, 82, 83, 84, 85, 86, 87, 88, 89 })]
    [InlineData("timePeriod:1800s", new[] { 90, 91, 92, 93, 94, 95, 96, 97, 98, 99 })]
    [InlineData("timePeriod:1900s", new[] { 100, 101, 102, 103, 104, 105, 106, 107, 108, 109, 110, 111, 112, 113, 114 })]
    [InlineData("timePeriod:2000s", new[] { 115, 116 })]
    public async Task GetAllQuestionsAsync_TimePeriodTagSentinelSet_AllExpectedQuestionsCarryTag(string tag, int[] expectedIds)
    {
        var questions = await _sut.GetAllQuestionsAsync(null, CancellationToken.None);
        var actualIds = questions.Where(q => q.Tags.Contains(tag)).Select(q => q.Id).OrderBy(id => id).ToArray();
        Assert.Equal(expectedIds.OrderBy(id => id).ToArray(), actualIds);
    }

    [Theory]
    [InlineData("branches:Legislative", new[] { 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32, 33, 34, 35 })]
    [InlineData("branches:Executive", new[] { 17, 36, 37, 38, 39, 40, 41, 42, 43, 44, 45, 46, 47, 48, 49 })]
    [InlineData("branches:Judicial", new[] { 50, 51, 52, 53, 54, 55, 56, 57 })]
    public async Task GetAllQuestionsAsync_BranchesTagSentinelSet_AllExpectedQuestionsCarryTag(string tag, int[] expectedIds)
    {
        var questions = await _sut.GetAllQuestionsAsync(null, CancellationToken.None);
        var actualIds = questions.Where(q => q.Tags.Contains(tag)).Select(q => q.Id).OrderBy(id => id).ToArray();
        Assert.Equal(expectedIds.OrderBy(id => id).ToArray(), actualIds);
    }

    [Theory]
    [InlineData("amendments:Bill of Rights", new[] { 6 })]
    [InlineData("amendments:10th Amendment", new[] { 60 })]
    [InlineData("amendments:14th Amendment", new[] { 97 })]
    [InlineData("amendments:15th Amendment", new[] { 63 })]
    [InlineData("amendments:19th Amendment", new[] { 63 })]
    [InlineData("amendments:24th Amendment", new[] { 63 })]
    [InlineData("amendments:26th Amendment", new[] { 63 })]
    public async Task GetAllQuestionsAsync_AmendmentsTagSentinelSet_AllExpectedQuestionsCarryTag(string tag, int[] expectedIds)
    {
        var questions = await _sut.GetAllQuestionsAsync(null, CancellationToken.None);
        var actualIds = questions.Where(q => q.Tags.Contains(tag)).Select(q => q.Id).OrderBy(id => id).ToArray();
        Assert.Equal(expectedIds.OrderBy(id => id).ToArray(), actualIds);
    }

    [Theory]
    [InlineData("civicConcepts:Rule of Law", new[] { 13 })]
    [InlineData("civicConcepts:Separation of Powers", new[] { 15, 16 })]
    [InlineData("civicConcepts:Federalism", new[] { 58, 59, 60 })]
    [InlineData("civicConcepts:Civic Participation", new[] { 69, 70 })]
    [InlineData("civicConcepts:Civil Rights", new[] { 112 })]
    public async Task GetAllQuestionsAsync_CivicConceptsTagSentinelSet_AllExpectedQuestionsCarryTag(string tag, int[] expectedIds)
    {
        var questions = await _sut.GetAllQuestionsAsync(null, CancellationToken.None);
        var actualIds = questions.Where(q => q.Tags.Contains(tag)).Select(q => q.Id).OrderBy(id => id).ToArray();
        Assert.Equal(expectedIds.OrderBy(id => id).ToArray(), actualIds);
    }

    [Fact]
    public async Task GetAllQuestionsAsync_AllTagsAreNamespaced()
    {
        var questions = await _sut.GetAllQuestionsAsync(null, CancellationToken.None);
        var allowedNamespaces = new HashSet<string> { "people", "wars", "documents", "timePeriod", "branches", "amendments", "civicConcepts" };
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
