namespace NaturalizationPuzzle.Api.Models;

public sealed record Representative
{
    public int Id { get; init; }
    public int StateId { get; init; }
    public required string District { get; init; }
    public required string Name { get; set; }
}
