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

        return states.Select(MapToDto).ToList();
    }

    public async Task<UsStateDto?> GetStateByIdAsync(int id, CancellationToken cancellationToken)
    {
        var state = await db.States.FindAsync([id], cancellationToken);
        return state is null ? null : MapToDto(state);
    }

    private static UsStateDto MapToDto(UsState state) => new(
        state.Id,
        state.Name,
        state.Abbreviation,
        state.Capital,
        state.Governor,
        state.SenatorOne,
        state.SenatorTwo,
        state.Representative);
}
