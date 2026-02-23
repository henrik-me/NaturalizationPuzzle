namespace NaturalizationPuzzle.Api.Models;

public sealed record QuizSession
{
    public int Id { get; init; }
    public required string SessionId { get; init; }
    public int StateId { get; init; }
    public bool Is6520Mode { get; init; }
    public int TotalQuestions { get; init; }
    public int CorrectAnswers { get; init; }
    public int IncorrectAnswers { get; init; }
    public bool IsComplete { get; init; }
    public DateTime CreatedAt { get; init; } = DateTime.UtcNow;
}
