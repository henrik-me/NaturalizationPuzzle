namespace NaturalizationPuzzle.Api.Models;

public sealed record Story
{
    public required string Slug { get; init; }
    public required string Title { get; init; }
    public required string Category { get; init; }
    public required string SubCategory { get; init; }
    public required string BodyMarkdown { get; init; }
    public required IReadOnlyList<StorySource> Sources { get; init; }
    public required IReadOnlyList<int> QuestionIds { get; init; }
    public required IReadOnlyList<OrphanedQuestion> OrphanedQuestionIds { get; init; }
    public int EstReadMinutes { get; init; }
    public int ReadingLevelMin { get; init; } = 70;
    public int FleschReadingEase { get; init; }
    public bool ModelMemoryUsed { get; init; }
    public bool StateAwarePreamble { get; init; }
}

public sealed record StorySource
{
    public required int Id { get; init; }
    public required string Title { get; init; }
    public required string Url { get; init; }
    public required string Type { get; init; }
    public required string SupportSnippet { get; init; }
}

public sealed record OrphanedQuestion
{
    public required int Id { get; init; }
    public required string Reason { get; init; }
}

public sealed record StoryListItemDto(
    string Slug,
    string Title,
    string Category,
    string SubCategory,
    int EstReadMinutes,
    int FleschReadingEase,
    int QuestionCount,
    bool ModelMemoryUsed,
    bool StateAwarePreamble);

public sealed record StoryDetailDto(
    string Slug,
    string Title,
    string Category,
    string SubCategory,
    string BodyMarkdown,
    IReadOnlyList<StorySource> Sources,
    int EstReadMinutes,
    int FleschReadingEase,
    bool ModelMemoryUsed,
    bool StateAwarePreamble,
    IReadOnlyList<QuestionDto> Questions);
