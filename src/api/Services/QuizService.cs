using Microsoft.EntityFrameworkCore;
using NaturalizationPuzzle.Api.Data;
using NaturalizationPuzzle.Api.Models;

namespace NaturalizationPuzzle.Api.Services;

public sealed class QuizService(AppDbContext db) : IQuizService
{
    public async Task<QuizResultDto> StartQuizAsync(QuizStartRequest request, CancellationToken cancellationToken)
    {
        var totalQuestions = request.Is6520Mode ? 10 : 20;
        var session = new QuizSession
        {
            SessionId = Guid.NewGuid().ToString(),
            StateId = request.StateId,
            Is6520Mode = request.Is6520Mode,
            TotalQuestions = totalQuestions,
            CorrectAnswers = 0,
            IncorrectAnswers = 0,
            IsComplete = false,
            CreatedAt = DateTime.UtcNow
        };

        db.QuizSessions.Add(session);
        await db.SaveChangesAsync(cancellationToken);

        return MapToDto(session);
    }

    public async Task<QuizResultDto?> GetQuizResultAsync(string sessionId, CancellationToken cancellationToken)
    {
        var session = await db.QuizSessions
            .AsNoTracking()
            .FirstOrDefaultAsync(s => s.SessionId == sessionId, cancellationToken);

        return session is null ? null : MapToDto(session);
    }

    private static QuizResultDto MapToDto(QuizSession session)
    {
        var passThreshold = session.Is6520Mode ? 6 : 12;
        return new QuizResultDto(
            session.SessionId,
            session.TotalQuestions,
            session.CorrectAnswers,
            session.IncorrectAnswers,
            session.IsComplete,
            session.CorrectAnswers >= passThreshold);
    }
}
