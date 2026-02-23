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
        Assert.Contains("John Smith and Mary Jones", q23.Answers);

        var q61 = questions.First(q => q.Id == 61);
        Assert.Contains("Jane Doe", q61.Answers);

        var q62 = questions.First(q => q.Id == 62);
        Assert.Contains("Test City", q62.Answers);
    }

    public void Dispose() => _db.Dispose();
}
