using NaturalizationPuzzle.Api.Models;

namespace NaturalizationPuzzle.Api.Services;

public interface IQuestionService
{
    Task<IReadOnlyList<QuestionDto>> GetAllQuestionsAsync(int? stateId, CancellationToken cancellationToken);
    Task<QuestionDto?> GetQuestionByIdAsync(int id, int? stateId, CancellationToken cancellationToken);
    Task<IReadOnlyList<QuestionDto>> GetQuestionsByCategoryAsync(string category, int? stateId, CancellationToken cancellationToken);
    Task<IReadOnlyList<QuestionDto>> Get6520QuestionsAsync(int? stateId, CancellationToken cancellationToken);

    /// <summary>
    /// Bulk variant of <see cref="GetQuestionByIdAsync"/>. Loads the state
    /// and representatives once per call instead of once per question, so
    /// callers (notably <see cref="StoryService"/>) avoid an N+1 round-trip.
    /// Returns the requested questions in the order they appear in <paramref name="ids"/>;
    /// missing IDs are silently dropped.
    /// </summary>
    Task<IReadOnlyList<QuestionDto>> GetQuestionsByIdsAsync(IReadOnlyList<int> ids, int? stateId, CancellationToken cancellationToken);
}
