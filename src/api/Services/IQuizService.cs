using NaturalizationPuzzle.Api.Models;

namespace NaturalizationPuzzle.Api.Services;

public interface IQuizService
{
    Task<QuizResultDto> StartQuizAsync(QuizStartRequest request, CancellationToken cancellationToken);
    Task<QuizResultDto?> GetQuizResultAsync(string sessionId, CancellationToken cancellationToken);
}
