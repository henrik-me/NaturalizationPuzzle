using NaturalizationPuzzle.Api.Services;

namespace NaturalizationPuzzle.Api.Endpoints;

public static class StateEndpoints
{
    public static void MapStateEndpoints(this WebApplication app)
    {
        var group = app.MapGroup("/api/v1/states")
            .WithTags("States");

        group.MapGet("/", async (
            IStateService stateService,
            CancellationToken cancellationToken) =>
        {
            var states = await stateService.GetAllStatesAsync(cancellationToken);
            return Results.Ok(states);
        })
        .WithName("GetAllStates");

        group.MapGet("/{id:int}", async (
            int id,
            IStateService stateService,
            CancellationToken cancellationToken) =>
        {
            var state = await stateService.GetStateByIdAsync(id, cancellationToken);
            return state is null ? Results.NotFound() : Results.Ok(state);
        })
        .WithName("GetStateById");
    }
}
