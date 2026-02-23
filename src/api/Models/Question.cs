namespace NaturalizationPuzzle.Api.Models;

public sealed record Question
{
    public int Id { get; init; }
    public required string Text { get; init; }
    public required string Category { get; init; }
    public required string SubCategory { get; init; }
    public bool Is6520Designated { get; init; }
    public ICollection<Answer> Answers { get; init; } = [];
}

public sealed record Answer
{
    public int Id { get; init; }
    public int QuestionId { get; init; }
    public required string Text { get; init; }
    public bool IsStateSpecific { get; init; }
}
