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

        var representatives = stateId.HasValue
            ? await db.Representatives.Where(r => r.StateId == stateId.Value).ToListAsync(cancellationToken)
            : [];

        return questions.Select(q => MapToDto(q, state, representatives)).ToList();
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

        var representatives = stateId.HasValue
            ? await db.Representatives.Where(r => r.StateId == stateId.Value).ToListAsync(cancellationToken)
            : [];

        return MapToDto(question, state, representatives);
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

        var representatives = stateId.HasValue
            ? await db.Representatives.Where(r => r.StateId == stateId.Value).ToListAsync(cancellationToken)
            : [];

        return questions.Select(q => MapToDto(q, state, representatives)).ToList();
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

        var representatives = stateId.HasValue
            ? await db.Representatives.Where(r => r.StateId == stateId.Value).ToListAsync(cancellationToken)
            : [];

        return questions.Select(q => MapToDto(q, state, representatives)).ToList();
    }

    private static QuestionDto MapToDto(Question question, UsState? state, IReadOnlyList<Representative> representatives)
    {
        var answers = new List<string>();
        foreach (var a in question.Answers)
        {
            if (a.IsStateSpecific && state is not null)
            {
                answers.AddRange(ResolveStateAnswers(question.Id, state, representatives));
            }
            else
            {
                answers.Add(a.Text);
            }
        }

        return new QuestionDto(
            question.Id,
            question.Text,
            question.Category,
            question.SubCategory,
            question.Is6520Designated,
            answers);
    }

    private static IReadOnlyList<string> ResolveStateAnswers(int questionId, UsState state, IReadOnlyList<Representative> representatives) => questionId switch
    {
        23 => [state.SenatorOne, state.SenatorTwo],
        29 => representatives.Select(r => r.Name).ToList(),
        61 => [state.Governor],
        62 => [state.Capital],
        _ => []
    };
}
