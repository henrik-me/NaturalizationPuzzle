namespace NaturalizationPuzzle.Api.Models;

public sealed record UsState
{
    public int Id { get; init; }
    public required string Name { get; init; }
    public required string Abbreviation { get; init; }
    public required string Capital { get; init; }
    public required string Governor { get; init; }
    public required string SenatorOne { get; init; }
    public required string SenatorTwo { get; init; }
    public required string Representative { get; init; }
}
