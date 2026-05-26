using Microsoft.EntityFrameworkCore;
using NaturalizationPuzzle.Api.Data;
using NaturalizationPuzzle.Api.Models;

namespace NaturalizationPuzzle.Api.Services;

public sealed class RepresentativeService(AppDbContext db) : IRepresentativeService
{
    public async Task<IReadOnlyList<VacantSeatDto>> GetVacantSeatsAsync(CancellationToken cancellationToken)
    {
        return await (
            from r in db.Representatives.AsNoTracking()
            join s in db.States.AsNoTracking() on r.StateId equals s.Id
            where r.Name == "Vacant"
            orderby s.Name, r.District
            select new VacantSeatDto(r.Id, r.StateId, s.Name, r.District)
        ).ToListAsync(cancellationToken);
    }

    public async Task<IReadOnlyList<VacantSeatDto>> GetVacantSeatsByStateAsync(int stateId, CancellationToken cancellationToken)
    {
        return await (
            from r in db.Representatives.AsNoTracking()
            join s in db.States.AsNoTracking() on r.StateId equals s.Id
            where r.StateId == stateId && r.Name == "Vacant"
            orderby r.District
            select new VacantSeatDto(r.Id, r.StateId, s.Name, r.District)
        ).ToListAsync(cancellationToken);
    }

    public async Task<RepresentativeDto?> UpdateRepresentativeAsync(int id, string name, CancellationToken cancellationToken)
    {
        var rep = await db.Representatives.FindAsync([id], cancellationToken);
        if (rep is null) return null;

        rep.Name = name.Trim();
        await db.SaveChangesAsync(cancellationToken);

        return new RepresentativeDto(rep.Id, rep.StateId, rep.District, rep.Name);
    }

    public async Task<int> ResetToSeedDataAsync(CancellationToken cancellationToken)
    {
        var seedLookup = RepresentativeSeedData.SeedEntries.ToDictionary(s => s.Id, s => s.Name);
        var allReps = await db.Representatives.ToListAsync(cancellationToken);
        var resetCount = 0;

        foreach (var rep in allReps)
        {
            if (seedLookup.TryGetValue(rep.Id, out var seedName) && rep.Name != seedName)
            {
                rep.Name = seedName;
                resetCount++;
            }
        }

        if (resetCount > 0)
            await db.SaveChangesAsync(cancellationToken);

        return resetCount;
    }
}
