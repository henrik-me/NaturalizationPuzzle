using NaturalizationPuzzle.Api.Models;

namespace NaturalizationPuzzle.Api.Services;

public interface IRepresentativeService
{
    Task<IReadOnlyList<VacantSeatDto>> GetVacantSeatsAsync(CancellationToken cancellationToken);
    Task<IReadOnlyList<VacantSeatDto>> GetVacantSeatsByStateAsync(int stateId, CancellationToken cancellationToken);
    Task<RepresentativeDto?> UpdateRepresentativeAsync(int id, string name, CancellationToken cancellationToken);
}
