using NaturalizationPuzzle.Api.Models;
using NaturalizationPuzzle.Api.Services;

namespace NaturalizationPuzzle.Api.Endpoints;

public static class RepresentativeEndpoints
{
    public static void MapRepresentativeEndpoints(this WebApplication app)
    {
        var group = app.MapGroup("/api/v1/representatives")
            .WithTags("Representatives");

        group.MapGet("/", async (
            int? stateId,
            IRepresentativeService repService,
            CancellationToken cancellationToken) =>
        {
            var reps = await repService.GetAllRepresentativesAsync(stateId, cancellationToken);
            return Results.Ok(reps);
        })
        .WithName("GetRepresentatives");

        group.MapGet("/vacant", async (
            int? stateId,
            IRepresentativeService repService,
            CancellationToken cancellationToken) =>
        {
            var vacancies = stateId.HasValue
                ? await repService.GetVacantSeatsByStateAsync(stateId.Value, cancellationToken)
                : await repService.GetVacantSeatsAsync(cancellationToken);
            return Results.Ok(vacancies);
        })
        .WithName("GetVacantSeats");

        group.MapPut("/{id:int}", async (
            int id,
            UpdateRepresentativeRequest request,
            IRepresentativeService repService,
            CancellationToken cancellationToken) =>
        {
            if (string.IsNullOrWhiteSpace(request.Name))
                return Results.BadRequest("Name is required.");

            var updated = await repService.UpdateRepresentativeAsync(id, request.Name, cancellationToken);
            return updated is null ? Results.NotFound() : Results.Ok(updated);
        })
        .WithName("UpdateRepresentative");

        group.MapPost("/reset", async (
            IRepresentativeService repService,
            CancellationToken cancellationToken) =>
        {
            var resetCount = await repService.ResetToSeedDataAsync(cancellationToken);
            return Results.Ok(new { resetCount });
        })
        .WithName("ResetRepresentatives");
    }
}
