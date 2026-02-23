using NaturalizationPuzzle.Api.Models;

namespace NaturalizationPuzzle.Api.Services;

public interface IStateService
{
    Task<IReadOnlyList<UsStateDto>> GetAllStatesAsync(CancellationToken cancellationToken);
    Task<UsStateDto?> GetStateByIdAsync(int id, CancellationToken cancellationToken);
}
