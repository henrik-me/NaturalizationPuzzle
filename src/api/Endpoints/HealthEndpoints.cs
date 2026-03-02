using Microsoft.EntityFrameworkCore;
using NaturalizationPuzzle.Api.Data;

namespace NaturalizationPuzzle.Api.Endpoints;

public static class HealthEndpoints
{
    public static void MapHealthEndpoints(this WebApplication app)
    {
        app.MapGet("/api/health", async (
            AppDbContext db,
            CancellationToken cancellationToken) =>
        {
            try
            {
                var canConnect = await db.Database.CanConnectAsync(cancellationToken);
                var questionCount = canConnect
                    ? await db.Questions.CountAsync(cancellationToken)
                    : 0;

                var status = canConnect && questionCount > 0 ? "healthy" : "degraded";

                return Results.Ok(new HealthResponse(
                    Status: status,
                    Database: canConnect,
                    QuestionCount: questionCount));
            }
            catch (Exception)
            {
                return Results.Json(
                    new HealthResponse(Status: "unhealthy", Database: false, QuestionCount: 0),
                    statusCode: 503);
            }
        })
        .WithName("HealthCheck")
        .WithTags("Health");
    }
}

public sealed record HealthResponse(
    string Status,
    bool Database,
    int QuestionCount);
