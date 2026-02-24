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
        // Find a vacant seat
        var vacancies = await _sut.GetVacantSeatsAsync(CancellationToken.None);
        var vacantSeat = vacancies.First(v => v.StateName == "California");

        // Update the vacant seat with a new name
        var updated = await _sut.UpdateRepresentativeAsync(
            vacantSeat.Id, "John NewRep", CancellationToken.None);

        Assert.NotNull(updated);
        Assert.Equal("John NewRep", updated.Name);
        Assert.Equal(vacantSeat.District, updated.District);
    }

    [Fact]
    public async Task UpdateRepresentativeAsync_PersistedChange_VerifiedOnRefetch()
    {
        // Get initial vacant count
        var initialVacancies = await _sut.GetVacantSeatsAsync(CancellationToken.None);
        Assert.Equal(3, initialVacancies.Count);

        // Update one vacant seat
        var vacantSeat = initialVacancies.First(v => v.StateName == "California");
        await _sut.UpdateRepresentativeAsync(
            vacantSeat.Id, "Jane Filled", CancellationToken.None);

        // Refetch vacancies — should now be 2
        var afterUpdate = await _sut.GetVacantSeatsAsync(CancellationToken.None);
        Assert.Equal(2, afterUpdate.Count);
        Assert.DoesNotContain(afterUpdate, v => v.Id == vacantSeat.Id);

        // Verify the updated rep is in the database with new name
        var rep = await _db.Representatives.FindAsync(vacantSeat.Id);
        Assert.NotNull(rep);
        Assert.Equal("Jane Filled", rep.Name);
    }

    [Fact]
    public async Task UpdateRepresentativeAsync_ReturnsNull_WhenIdNotFound()
    {
        var result = await _sut.UpdateRepresentativeAsync(
            99999, "Nobody", CancellationToken.None);

        Assert.Null(result);
    }

    [Fact]
    public async Task SeedData_AllRepresentatives_MatchDatabaseAfterRefetch()
    {
        // Fetch all representatives from the database
        var allReps = await _db.Representatives
            .OrderBy(r => r.Id)
            .ToListAsync();

        Assert.Equal(435, allReps.Count);

        // Verify the 3 vacant seats exist
        var vacantReps = allReps.Where(r => r.Name == "Vacant").ToList();
        Assert.Equal(3, vacantReps.Count);

        // Verify CA-1 is vacant (StateId 5)
        var ca1 = vacantReps.FirstOrDefault(r => r.StateId == 5);
        Assert.NotNull(ca1);
        Assert.Equal("1st", ca1.District);

        // Verify GA-14 is vacant (StateId 10)
        var ga14 = vacantReps.FirstOrDefault(r => r.StateId == 10);
        Assert.NotNull(ga14);
        Assert.Equal("14th", ga14.District);

        // Verify NJ-11 is vacant (StateId 30)
        var nj11 = vacantReps.FirstOrDefault(r => r.StateId == 30);
        Assert.NotNull(nj11);
        Assert.Equal("11th", nj11.District);

        // Verify non-vacant reps have real names
        var nonVacant = allReps.Where(r => r.Name != "Vacant").ToList();
        Assert.Equal(432, nonVacant.Count);
        Assert.All(nonVacant, r => Assert.False(string.IsNullOrWhiteSpace(r.Name)));
    }

    [Fact]
    public async Task UpdateVacantSeat_ThenRefetch_StateRepresentativesReflectChange()
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

        // Refetch all CA representatives
        var caAfter = await _db.Representatives
            .Where(r => r.StateId == 5)
            .ToListAsync();
        Assert.Equal(52, caAfter.Count);
        Assert.DoesNotContain(caAfter, r => r.Name == "Vacant");
        Assert.Contains(caAfter, r => r.Name == "New CA Rep" && r.District == "1st");
    }

    public void Dispose() => _db.Dispose();
}
