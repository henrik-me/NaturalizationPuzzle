using Microsoft.EntityFrameworkCore;
using NaturalizationPuzzle.Api.Data;
using NaturalizationPuzzle.Api.Models;

namespace NaturalizationPuzzle.Api.Services;

public sealed class StateService(AppDbContext db) : IStateService
{
    public async Task<IReadOnlyList<UsStateDto>> GetAllStatesAsync(CancellationToken cancellationToken) =>
        await ProjectToDto(db.States.AsNoTracking().OrderBy(s => s.Name))
            .ToListAsync(cancellationToken);

    public async Task<UsStateDto?> GetStateByIdAsync(int id, CancellationToken cancellationToken) =>
        await ProjectToDto(db.States.AsNoTracking().Where(s => s.Id == id))
            .FirstOrDefaultAsync(cancellationToken);

    // Shared server-side projection: a single SQL statement loads each state with
    // its representatives via a correlated subquery. The inner OrderBy(r => r.Id)
    // pins a stable, deterministic ordering for the rep name list so downstream
    // UI/tests don't depend on the database's unspecified default row order.
    private IQueryable<UsStateDto> ProjectToDto(IQueryable<UsState> source) =>
        source.Select(s => new UsStateDto(
            s.Id,
            s.Name,
            s.Abbreviation,
            s.Capital,
            s.Governor,
            s.SenatorOne,
            s.SenatorTwo,
            db.Representatives
                .Where(r => r.StateId == s.Id)
                .OrderBy(r => r.Id)
                .Select(r => r.Name)
                .ToList()));
}
