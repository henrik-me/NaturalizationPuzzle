using System.Reflection;
using System.Text;
using NaturalizationPuzzle.Api.Models;

namespace NaturalizationPuzzle.Api.Services;

public sealed class StoryService : IStoryService
{
    private readonly IQuestionService _questionService;
    private readonly Lazy<IReadOnlyList<Story>> _stories;

    public StoryService(IQuestionService questionService)
    {
        _questionService = questionService;
        _stories = new Lazy<IReadOnlyList<Story>>(LoadStories, isThreadSafe: true);
    }

    public IReadOnlyList<Story> GetAllStories() => _stories.Value;

    public Task<IReadOnlyList<StoryListItemDto>> ListAsync(CancellationToken cancellationToken)
    {
        var items = _stories.Value
            .Select(s => new StoryListItemDto(
                s.Slug,
                s.Title,
                s.Category,
                s.SubCategory,
                s.EstReadMinutes,
                s.ReadingLevelFleschKincaid,
                s.QuestionIds.Count,
                s.ModelMemoryUsed,
                s.StateAwarePreamble))
            .ToList();
        return Task.FromResult<IReadOnlyList<StoryListItemDto>>(items);
    }

    public async Task<StoryDetailDto?> GetAsync(string slug, int? stateId, CancellationToken cancellationToken)
    {
        var story = _stories.Value.FirstOrDefault(s =>
            string.Equals(s.Slug, slug, StringComparison.Ordinal));
        if (story is null)
        {
            return null;
        }

        // Bulk fetch — loads state + representatives once instead of N times
        // (one per question). Resolves Copilot review feedback on the N+1
        // pattern.
        var questions = await _questionService
            .GetQuestionsByIdsAsync(story.QuestionIds, stateId, cancellationToken);

        return new StoryDetailDto(
            story.Slug,
            story.Title,
            story.Category,
            story.SubCategory,
            story.BodyMarkdown,
            story.Sources,
            story.EstReadMinutes,
            story.ReadingLevelFleschKincaid,
            story.ModelMemoryUsed,
            story.StateAwarePreamble,
            questions);
    }

    private static IReadOnlyList<Story> LoadStories()
    {
        var assembly = typeof(StoryService).Assembly;
        var mdNames = assembly.GetManifestResourceNames()
            .Where(n => n.StartsWith("stories.", StringComparison.Ordinal)
                        && n.EndsWith(".md", StringComparison.Ordinal))
            .OrderBy(n => n, StringComparer.Ordinal)
            .ToList();

        var stories = new List<Story>(mdNames.Count);
        foreach (var mdName in mdNames)
        {
            var slug = mdName.Substring(
                "stories.".Length,
                mdName.Length - "stories.".Length - ".md".Length);
            var sourcesName = $"stories.{slug}.sources.json";

            var md = ReadResource(assembly, mdName);
            var json = ReadResource(assembly, sourcesName);
            stories.Add(StoryParser.Parse(slug, md, json));
        }

        return stories;
    }

    private static string ReadResource(Assembly assembly, string name)
    {
        using var stream = assembly.GetManifestResourceStream(name)
            ?? throw new InvalidOperationException($"Embedded resource not found: {name}");
        using var reader = new StreamReader(stream, Encoding.UTF8);
        return reader.ReadToEnd();
    }
}
