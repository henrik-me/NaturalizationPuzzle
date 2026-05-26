using Microsoft.EntityFrameworkCore;
using NaturalizationPuzzle.Api.Data;
using NaturalizationPuzzle.Api.Services;

namespace NaturalizationPuzzle.Api.Tests;

public sealed class RepresentativeServiceTests : IDisposable
{
    private readonly AppDbContext _db;
    private readonly RepresentativeService _sut;

    public RepresentativeServiceTests()
    {
        var options = new DbContextOptionsBuilder<AppDbContext>()
            .UseInMemoryDatabase(Guid.NewGuid().ToString())
            .Options;

        _db = new AppDbContext(options);
        _db.Database.EnsureCreated();
        _sut = new RepresentativeService(_db);
    }

    [Fact]
    public async Task GetAllRepresentativesAsync_NoFilter_ReturnsAllSeededReps()
    {
        var reps = await _sut.GetAllRepresentativesAsync(null, CancellationToken.None);

        Assert.Equal(RepresentativeSeedData.SeedEntries.Count, reps.Count);

        // Verify ordering: by state name, then district. Build expected sequence
        // by joining seed reps with state names and ordering identically.
        var states = await _db.States.AsNoTracking().ToDictionaryAsync(s => s.Id, s => s.Name);
        var expectedOrder = reps
            .OrderBy(r => states[r.StateId])
            .ThenBy(r => r.District)
            .Select(r => r.Id)
            .ToList();
        Assert.Equal(expectedOrder, reps.Select(r => r.Id).ToList());
    }

    [Fact]
    public async Task GetAllRepresentativesAsync_WithStateId_ReturnsOnlyThatStatesReps()
    {
        // StateId 43 = Texas (typical multi-district state).
        var texasFromDb = await _db.Representatives.AsNoTracking()
            .Where(r => r.StateId == 43)
            .ToListAsync();

        var reps = await _sut.GetAllRepresentativesAsync(43, CancellationToken.None);

        Assert.NotEmpty(reps);
        Assert.Equal(texasFromDb.Count, reps.Count);
        Assert.All(reps, r => Assert.Equal(43, r.StateId));
        var expectedDistricts = texasFromDb.Select(r => r.District).OrderBy(d => d).ToList();
        var actualDistricts = reps.Select(r => r.District).OrderBy(d => d).ToList();
        Assert.Equal(expectedDistricts, actualDistricts);
    }

    [Fact]
    public async Task GetAllRepresentativesAsync_WithUnknownStateId_ReturnsEmpty()
    {
        var reps = await _sut.GetAllRepresentativesAsync(999999, CancellationToken.None);

        Assert.Empty(reps);
    }

    [Fact]
    public async Task GetVacantSeatsAsync_ReturnsOnlyVacantRepresentatives()
    {
        var vacancies = await _sut.GetVacantSeatsAsync(CancellationToken.None);

        Assert.Equal(3, vacancies.Count);
        Assert.All(vacancies, v => Assert.NotEqual("Vacant", v.StateName));
    }

    [Fact]
    public async Task GetVacantSeatsByStateAsync_ReturnsVacanciesForSpecificState()
    {
        // StateId 5 = California, which has 1 vacant seat (1st district)
        var vacancies = await _sut.GetVacantSeatsByStateAsync(5, CancellationToken.None);

        Assert.Single(vacancies);
        Assert.Equal("1st", vacancies[0].District);
        Assert.Equal("California", vacancies[0].StateName);
    }

    [Fact]
    public async Task GetVacantSeatsByStateAsync_ReturnsEmpty_WhenNoVacancies()
    {
        // StateId 1 = Alabama, which has no vacant seats
        var vacancies = await _sut.GetVacantSeatsByStateAsync(1, CancellationToken.None);

        Assert.Empty(vacancies);
    }

    [Fact]
    public async Task UpdateRepresentativeAsync_UpdatesVacantSeatName()
    {
        var vacancies = await _sut.GetVacantSeatsAsync(CancellationToken.None);
        var vacantSeat = vacancies.First(v => v.StateName == "California");

        var updated = await _sut.UpdateRepresentativeAsync(
            vacantSeat.Id, "John NewRep", CancellationToken.None);

        Assert.NotNull(updated);
        Assert.Equal("John NewRep", updated.Name);
        Assert.Equal(vacantSeat.District, updated.District);
    }

    [Fact]
    public async Task UpdateRepresentativeAsync_ReturnsNull_WhenIdNotFound()
    {
        var result = await _sut.UpdateRepresentativeAsync(
            99999, "Nobody", CancellationToken.None);

        Assert.Null(result);
    }

    [Fact]
    public async Task UpdateThenReset_RestoresAllRepresentativesToSeedData()
    {
        // 1. Verify initial vacant count
        var initialVacancies = await _sut.GetVacantSeatsAsync(CancellationToken.None);
        Assert.Equal(3, initialVacancies.Count);

        // 2. Update all 3 vacant seats with new names
        foreach (var vacancy in initialVacancies)
        {
            await _sut.UpdateRepresentativeAsync(
                vacancy.Id, $"Filled {vacancy.District}", CancellationToken.None);
        }

        // 3. Verify all vacancies are filled
        var afterUpdate = await _sut.GetVacantSeatsAsync(CancellationToken.None);
        Assert.Empty(afterUpdate);

        // 4. Verify changes persisted in database
        var caRep = await _db.Representatives.FindAsync(initialVacancies[0].Id);
        Assert.NotNull(caRep);
        Assert.StartsWith("Filled", caRep.Name);

        // 5. Reset to seed data
        var resetCount = await _sut.ResetToSeedDataAsync(CancellationToken.None);
        Assert.Equal(3, resetCount);

        // 6. Verify all 3 vacant seats are restored
        var afterReset = await _sut.GetVacantSeatsAsync(CancellationToken.None);
        Assert.Equal(3, afterReset.Count);

        // 7. Verify California 1st is vacant again
        var caVacancy = afterReset.FirstOrDefault(v => v.StateName == "California");
        Assert.NotNull(caVacancy);
        Assert.Equal("1st", caVacancy.District);
    }

    [Fact]
    public async Task ResetToSeedDataAsync_ReturnsZero_WhenNoChanges()
    {
        var resetCount = await _sut.ResetToSeedDataAsync(CancellationToken.None);
        Assert.Equal(0, resetCount);
    }

    [Fact]
    public async Task SeedData_AllRepresentatives_MatchDatabaseAfterRefetch()
    {
        var allReps = await _db.Representatives
            .OrderBy(r => r.Id)
            .ToListAsync();

        Assert.Equal(435, allReps.Count);

        // Validate every DB entry matches the seed data
        var seedEntries = RepresentativeSeedData.SeedEntries;
        Assert.Equal(seedEntries.Count, allReps.Count);

        foreach (var seed in seedEntries)
        {
            var dbRep = allReps.FirstOrDefault(r => r.Id == seed.Id);
            Assert.NotNull(dbRep);
            Assert.Equal(seed.Name, dbRep.Name);
            Assert.Equal(seed.StateId, dbRep.StateId);
            Assert.Equal(seed.District, dbRep.District);
        }
    }

    [Fact]
    public async Task UpdateThenRefetch_StateRepresentativesReflectChange_ThenResetRestores()
    {
        // Get California's representatives before update
        var caBefore = await _db.Representatives
            .Where(r => r.StateId == 5)
            .ToListAsync();
        Assert.Equal(52, caBefore.Count);
        Assert.Contains(caBefore, r => r.Name == "Vacant" && r.District == "1st");

        // Update the vacant seat
        var vacant = caBefore.First(r => r.Name == "Vacant");
        await _sut.UpdateRepresentativeAsync(vacant.Id, "New CA Rep", CancellationToken.None);

        // Refetch — vacancy should be gone
        var caAfter = await _db.Representatives
            .Where(r => r.StateId == 5)
            .ToListAsync();
        Assert.Equal(52, caAfter.Count);
        Assert.DoesNotContain(caAfter, r => r.Name == "Vacant");
        Assert.Contains(caAfter, r => r.Name == "New CA Rep" && r.District == "1st");

        // Reset to seed data
        await _sut.ResetToSeedDataAsync(CancellationToken.None);

        // Refetch — vacancy should be restored
        var caReset = await _db.Representatives
            .Where(r => r.StateId == 5)
            .ToListAsync();
        Assert.Equal(52, caReset.Count);
        Assert.Contains(caReset, r => r.Name == "Vacant" && r.District == "1st");
        Assert.DoesNotContain(caReset, r => r.Name == "New CA Rep");
    }

    public void Dispose() => _db.Dispose();
}
