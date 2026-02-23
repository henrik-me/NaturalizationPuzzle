using NaturalizationPuzzle.Api.Services;

namespace NaturalizationPuzzle.Api.Endpoints;

public static class QuestionEndpoints
{
    public static void MapQuestionEndpoints(this WebApplication app)
    {
        var group = app.MapGroup("/api/v1/questions")
            .WithTags("Questions");

        group.MapGet("/", async (
            int? stateId,
            IQuestionService questionService,
            CancellationToken cancellationToken) =>
        {
            var questions = await questionService.GetAllQuestionsAsync(stateId, cancellationToken);
            return Results.Ok(questions);
        })
        .WithName("GetAllQuestions");

        group.MapGet("/{id:int}", async (
            int id,
            int? stateId,
            IQuestionService questionService,
            CancellationToken cancellationToken) =>
        {
            var question = await questionService.GetQuestionByIdAsync(id, stateId, cancellationToken);
            return question is null ? Results.NotFound() : Results.Ok(question);
        })
        .WithName("GetQuestionById");

        group.MapGet("/category/{category}", async (
            string category,
            int? stateId,
            IQuestionService questionService,
            CancellationToken cancellationToken) =>
        {
            var questions = await questionService.GetQuestionsByCategoryAsync(category, stateId, cancellationToken);
            return Results.Ok(questions);
        })
        .WithName("GetQuestionsByCategory");

        group.MapGet("/6520", async (
            int? stateId,
            IQuestionService questionService,
            CancellationToken cancellationToken) =>
        {
            var questions = await questionService.Get6520QuestionsAsync(stateId, cancellationToken);
            return Results.Ok(questions);
        })
        .WithName("Get6520Questions");
    }
}
