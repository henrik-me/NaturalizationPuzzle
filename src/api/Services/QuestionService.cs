using Microsoft.EntityFrameworkCore;
using NaturalizationPuzzle.Api.Data;
using NaturalizationPuzzle.Api.Models;

namespace NaturalizationPuzzle.Api.Services;

public sealed class QuestionService(AppDbContext db) : IQuestionService
{
    public async Task<IReadOnlyList<QuestionDto>> GetAllQuestionsAsync(int? stateId, CancellationToken cancellationToken)
    {
        var questions = await db.Questions
            .Include(q => q.Answers)
            .OrderBy(q => q.Id)
            .ToListAsync(cancellationToken);

        var state = stateId.HasValue
            ? await db.States.FindAsync([stateId.Value], cancellationToken)
            : null;

        return questions.Select(q => MapToDto(q, state)).ToList();
    }

    public async Task<QuestionDto?> GetQuestionByIdAsync(int id, int? stateId, CancellationToken cancellationToken)
    {
        var question = await db.Questions
            .Include(q => q.Answers)
            .FirstOrDefaultAsync(q => q.Id == id, cancellationToken);

        if (question is null) return null;

        var state = stateId.HasValue
            ? await db.States.FindAsync([stateId.Value], cancellationToken)
            : null;

        return MapToDto(question, state);
    }

    public async Task<IReadOnlyList<QuestionDto>> GetQuestionsByCategoryAsync(string category, int? stateId, CancellationToken cancellationToken)
    {
        var questions = await db.Questions
            .Include(q => q.Answers)
            .Where(q => q.Category == category)
            .OrderBy(q => q.Id)
            .ToListAsync(cancellationToken);

        var state = stateId.HasValue
            ? await db.States.FindAsync([stateId.Value], cancellationToken)
            : null;

        return questions.Select(q => MapToDto(q, state)).ToList();
    }

    public async Task<IReadOnlyList<QuestionDto>> Get6520QuestionsAsync(int? stateId, CancellationToken cancellationToken)
    {
        var questions = await db.Questions
            .Include(q => q.Answers)
            .Where(q => q.Is6520Designated)
            .OrderBy(q => q.Id)
            .ToListAsync(cancellationToken);

        var state = stateId.HasValue
            ? await db.States.FindAsync([stateId.Value], cancellationToken)
            : null;

        return questions.Select(q => MapToDto(q, state)).ToList();
    }

    private static QuestionDto MapToDto(Question question, UsState? state)
    {
        var answers = question.Answers
            .Select(a => a.IsStateSpecific && state is not null
                ? ResolveStateAnswer(question.Id, state)
                : a.Text)
            .Where(a => a is not null)
            .Cast<string>()
            .ToList();

        return new QuestionDto(
            question.Id,
            question.Text,
            question.Category,
            question.SubCategory,
            question.Is6520Designated,
            answers);
    }

    private static string? ResolveStateAnswer(int questionId, UsState state) => questionId switch
    {
        23 => $"{state.SenatorOne} and {state.SenatorTwo}",
        29 => state.Representative,
        61 => state.Governor,
        62 => state.Capital,
        _ => null
    };
}
