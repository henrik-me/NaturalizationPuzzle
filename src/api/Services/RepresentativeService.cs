using Microsoft.EntityFrameworkCore;
using NaturalizationPuzzle.Api.Data;
using NaturalizationPuzzle.Api.Models;

namespace NaturalizationPuzzle.Api.Services;

public sealed class RepresentativeService(AppDbContext db) : IRepresentativeService
{
    public async Task<IReadOnlyList<RepresentativeDto>> GetAllRepresentativesAsync(int? stateId, CancellationToken cancellationToken)
    {
        if (stateId.HasValue)
        {
            return await (
                from r in db.Representatives.AsNoTracking()
                where r.StateId == stateId.Value
                // District values are strings like "1st", "2nd", "10th", "At Large".
                // Order by length first so numeric districts sort naturally
                // ("9th" before "10th", not "10th" before "2nd") and "At Large"
                // (length 8) sorts after all numeric districts.
                orderby r.District.Length, r.District
                select new RepresentativeDto(r.Id, r.StateId, r.District, r.Name)
            ).ToListAsync(cancellationToken);
        }

        return await (
            from r in db.Representatives.AsNoTracking()
            join s in db.States.AsNoTracking() on r.StateId equals s.Id
            // See district ordering note above.
            orderby s.Name, r.District.Length, r.District
            select new RepresentativeDto(r.Id, r.StateId, r.District, r.Name)
        ).ToListAsync(cancellationToken);
    }

    public async Task<IReadOnlyList<VacantSeatDto>> GetVacantSeatsAsync(CancellationToken cancellationToken)
    {
        return await (
            from r in db.Representatives.AsNoTracking()
            join s in db.States.AsNoTracking() on r.StateId equals s.Id
            where r.Name == "Vacant"
            // See district ordering note in GetAllRepresentativesAsync.
            orderby s.Name, r.District.Length, r.District
            select new VacantSeatDto(r.Id, r.StateId, s.Name, r.District)
        ).ToListAsync(cancellationToken);
    }

    public async Task<IReadOnlyList<VacantSeatDto>> GetVacantSeatsByStateAsync(int stateId, CancellationToken cancellationToken)
    {
        return await (
            from r in db.Representatives.AsNoTracking()
            join s in db.States.AsNoTracking() on r.StateId equals s.Id
            where r.StateId == stateId && r.Name == "Vacant"
            // See district ordering note in GetAllRepresentativesAsync.
            orderby r.District.Length, r.District
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
