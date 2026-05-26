using Microsoft.EntityFrameworkCore;
using NaturalizationPuzzle.Api.Data;
using NaturalizationPuzzle.Api.Models;

namespace NaturalizationPuzzle.Api.Services;

public sealed class StateService(AppDbContext db) : IStateService
{
    public async Task<IReadOnlyList<UsStateDto>> GetAllStatesAsync(CancellationToken cancellationToken)
    {
        // Single server-side projection: replaces the previous "load all states +
        // load all representatives + in-memory filter" pattern. The inner OrderBy
        // by Representative.Id preserves the historical insertion ordering that
        // the legacy in-memory filter inherited from the unordered ToListAsync().
        return await db.States
            .AsNoTracking()
            .OrderBy(s => s.Name)
            .Select(s => new UsStateDto(
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
                    .ToList()))
            .ToListAsync(cancellationToken);
    }

    public async Task<UsStateDto?> GetStateByIdAsync(int id, CancellationToken cancellationToken)
    {
        return await db.States
            .AsNoTracking()
            .Where(s => s.Id == id)
            .Select(s => new UsStateDto(
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
                    .ToList()))
            .FirstOrDefaultAsync(cancellationToken);
    }
}
