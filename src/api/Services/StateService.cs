using Microsoft.EntityFrameworkCore;
using NaturalizationPuzzle.Api.Data;
using NaturalizationPuzzle.Api.Models;

namespace NaturalizationPuzzle.Api.Services;

public sealed class StateService(AppDbContext db) : IStateService
{
    public async Task<IReadOnlyList<UsStateDto>> GetAllStatesAsync(CancellationToken cancellationToken)
    {
        var states = await db.States
            .OrderBy(s => s.Name)
            .ToListAsync(cancellationToken);

        var representatives = await db.Representatives
            .ToListAsync(cancellationToken);

        return states.Select(s => MapToDto(s, representatives.Where(r => r.StateId == s.Id).ToList())).ToList();
    }

    public async Task<UsStateDto?> GetStateByIdAsync(int id, CancellationToken cancellationToken)
    {
        var state = await db.States.FindAsync([id], cancellationToken);
        if (state is null) return null;

        var reps = await db.Representatives
            .Where(r => r.StateId == id)
            .ToListAsync(cancellationToken);

        return MapToDto(state, reps);
    }

    private static UsStateDto MapToDto(UsState state, IReadOnlyList<Representative> representatives) => new(
        state.Id,
        state.Name,
        state.Abbreviation,
        state.Capital,
        state.Governor,
        state.SenatorOne,
        state.SenatorTwo,
        representatives.Select(r => r.Name).ToList());
}
