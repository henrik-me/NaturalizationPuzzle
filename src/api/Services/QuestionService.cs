using Microsoft.EntityFrameworkCore;
using NaturalizationPuzzle.Api.Data;
using NaturalizationPuzzle.Api.Models;

namespace NaturalizationPuzzle.Api.Services;

public sealed class QuestionService(AppDbContext db) : IQuestionService
{
    public async Task<IReadOnlyList<QuestionDto>> GetAllQuestionsAsync(int? stateId, CancellationToken cancellationToken)
    {
        var questions = await db.Questions
            .AsNoTracking()
            .Include(q => q.Answers)
            .OrderBy(q => q.Id)
            .ToListAsync(cancellationToken);

        var (state, representatives) = await LoadStateContextAsync(stateId, cancellationToken);

        return questions.Select(q => MapToDto(q, state, representatives)).ToList();
    }

    public async Task<QuestionDto?> GetQuestionByIdAsync(int id, int? stateId, CancellationToken cancellationToken)
    {
        var question = await db.Questions
            .AsNoTracking()
            .Include(q => q.Answers)
            .FirstOrDefaultAsync(q => q.Id == id, cancellationToken);

        if (question is null) return null;

        var (state, representatives) = await LoadStateContextAsync(stateId, cancellationToken);

        return MapToDto(question, state, representatives);
    }

    public async Task<IReadOnlyList<QuestionDto>> GetQuestionsByCategoryAsync(string category, int? stateId, CancellationToken cancellationToken)
    {
        var questions = await db.Questions
            .AsNoTracking()
            .Include(q => q.Answers)
            .Where(q => q.Category == category)
            .OrderBy(q => q.Id)
            .ToListAsync(cancellationToken);

        var (state, representatives) = await LoadStateContextAsync(stateId, cancellationToken);

        return questions.Select(q => MapToDto(q, state, representatives)).ToList();
    }

    public async Task<IReadOnlyList<QuestionDto>> Get6520QuestionsAsync(int? stateId, CancellationToken cancellationToken)
    {
        var questions = await db.Questions
            .AsNoTracking()
            .Include(q => q.Answers)
            .Where(q => q.Is6520Designated)
            .OrderBy(q => q.Id)
            .ToListAsync(cancellationToken);

        var (state, representatives) = await LoadStateContextAsync(stateId, cancellationToken);

        return questions.Select(q => MapToDto(q, state, representatives)).ToList();
    }

    public async Task<IReadOnlyList<QuestionDto>> GetQuestionsByIdsAsync(IReadOnlyList<int> ids, int? stateId, CancellationToken cancellationToken)
    {
        if (ids.Count == 0)
        {
            return [];
        }

        var idSet = ids.ToHashSet();
        var questions = await db.Questions
            .AsNoTracking()
            .Include(q => q.Answers)
            .Where(q => idSet.Contains(q.Id))
            .ToListAsync(cancellationToken);

        var (state, representatives) = await LoadStateContextAsync(stateId, cancellationToken);

        var byId = questions.ToDictionary(q => q.Id, q => MapToDto(q, state, representatives));
        var ordered = new List<QuestionDto>(ids.Count);
        foreach (var id in ids)
        {
            if (byId.TryGetValue(id, out var dto))
            {
                ordered.Add(dto);
            }
        }
        return ordered;
    }

    // Loads the optional state + its representatives for state-specific answer
    // resolution. Both lookups are read-only and use AsNoTracking to avoid
    // populating the change tracker on hot read paths.
    private async Task<(UsState? state, IReadOnlyList<Representative> reps)> LoadStateContextAsync(
        int? stateId, CancellationToken cancellationToken)
    {
        if (!stateId.HasValue)
        {
            return (null, []);
        }

        var state = await db.States
            .AsNoTracking()
            .FirstOrDefaultAsync(s => s.Id == stateId.Value, cancellationToken);

        var reps = await db.Representatives
            .AsNoTracking()
            .Where(r => r.StateId == stateId.Value)
            .OrderBy(r => r.Id)
            .ToListAsync(cancellationToken);

        return (state, reps);
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
            question.Tags,
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
