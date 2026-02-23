using Microsoft.EntityFrameworkCore;
using NaturalizationPuzzle.Api.Data;
using NaturalizationPuzzle.Api.Models;
using NaturalizationPuzzle.Api.Services;

namespace NaturalizationPuzzle.Api.Tests;

public sealed class QuizServiceTests : IDisposable
{
    private readonly AppDbContext _db;
    private readonly QuizService _sut;

    public QuizServiceTests()
    {
        var options = new DbContextOptionsBuilder<AppDbContext>()
            .UseInMemoryDatabase(Guid.NewGuid().ToString())
            .Options;

        _db = new AppDbContext(options);
        _db.Database.EnsureCreated();
        _sut = new QuizService(_db);
    }

    [Fact]
    public async Task StartQuizAsync_CreatesSession_StandardMode()
    {
        var result = await _sut.StartQuizAsync(new QuizStartRequest(1, false), CancellationToken.None);

        Assert.NotNull(result);
        Assert.Equal(20, result.TotalQuestions);
        Assert.False(result.IsComplete);
        Assert.NotEmpty(result.SessionId);
    }

    [Fact]
    public async Task StartQuizAsync_CreatesSession_6520Mode()
    {
        var result = await _sut.StartQuizAsync(new QuizStartRequest(1, true), CancellationToken.None);

        Assert.NotNull(result);
        Assert.Equal(10, result.TotalQuestions);
    }

    [Fact]
    public async Task GetQuizResultAsync_ReturnsResult_WhenExists()
    {
        var started = await _sut.StartQuizAsync(new QuizStartRequest(1, false), CancellationToken.None);
        var result = await _sut.GetQuizResultAsync(started.SessionId, CancellationToken.None);

        Assert.NotNull(result);
        Assert.Equal(started.SessionId, result.SessionId);
    }

    [Fact]
    public async Task GetQuizResultAsync_ReturnsNull_WhenNotExists()
    {
        var result = await _sut.GetQuizResultAsync("nonexistent", CancellationToken.None);
        Assert.Null(result);
    }

    public void Dispose() => _db.Dispose();
}
