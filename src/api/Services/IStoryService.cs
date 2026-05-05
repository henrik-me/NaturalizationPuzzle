using NaturalizationPuzzle.Api.Models;

namespace NaturalizationPuzzle.Api.Services;

public interface IStoryService
{
    Task<IReadOnlyList<StoryListItemDto>> ListAsync(CancellationToken cancellationToken);

    Task<StoryDetailDto?> GetAsync(string slug, int? stateId, CancellationToken cancellationToken);

    /// <summary>
    /// Returns the parsed Story models. Exposed for content-validation tests; not used by endpoints.
    /// </summary>
    IReadOnlyList<Story> GetAllStories();
}
