using NaturalizationPuzzle.Api.Models;

namespace NaturalizationPuzzle.Api.Services;

public interface IQuestionService
{
    Task<IReadOnlyList<QuestionDto>> GetAllQuestionsAsync(int? stateId, CancellationToken cancellationToken);
    Task<QuestionDto?> GetQuestionByIdAsync(int id, int? stateId, CancellationToken cancellationToken);
    Task<IReadOnlyList<QuestionDto>> GetQuestionsByCategoryAsync(string category, int? stateId, CancellationToken cancellationToken);
    Task<IReadOnlyList<QuestionDto>> Get6520QuestionsAsync(int? stateId, CancellationToken cancellationToken);
}
