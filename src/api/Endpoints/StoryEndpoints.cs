using NaturalizationPuzzle.Api.Services;

namespace NaturalizationPuzzle.Api.Endpoints;

public static class StoryEndpoints
{
    public static void MapStoryEndpoints(this WebApplication app)
    {
        var group = app.MapGroup("/api/v1/stories")
            .WithTags("Stories");

        group.MapGet("/", async (
            IStoryService storyService,
            CancellationToken cancellationToken) =>
        {
            var stories = await storyService.ListAsync(cancellationToken);
            return Results.Ok(stories);
        })
        .WithName("ListStories");

        group.MapGet("/{id}", async (
            string id,
            int? stateId,
            IStoryService storyService,
            CancellationToken cancellationToken) =>
        {
            var story = await storyService.GetAsync(id, stateId, cancellationToken);
            return story is null ? Results.NotFound() : Results.Ok(story);
        })
        .WithName("GetStoryById");
    }
}
