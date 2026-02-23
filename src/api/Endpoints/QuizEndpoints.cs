using NaturalizationPuzzle.Api.Models;
using NaturalizationPuzzle.Api.Services;

namespace NaturalizationPuzzle.Api.Endpoints;

public static class QuizEndpoints
{
    public static void MapQuizEndpoints(this WebApplication app)
    {
        var group = app.MapGroup("/api/v1/quiz")
            .WithTags("Quiz");

        group.MapPost("/start", async (
            QuizStartRequest request,
            IQuizService quizService,
            CancellationToken cancellationToken) =>
        {
            var result = await quizService.StartQuizAsync(request, cancellationToken);
            return Results.Created($"/api/v1/quiz/{result.SessionId}", result);
        })
        .WithName("StartQuiz");

        group.MapGet("/{sessionId}", async (
            string sessionId,
            IQuizService quizService,
            CancellationToken cancellationToken) =>
        {
            var result = await quizService.GetQuizResultAsync(sessionId, cancellationToken);
            return result is null ? Results.NotFound() : Results.Ok(result);
        })
        .WithName("GetQuizResult");
    }
}
