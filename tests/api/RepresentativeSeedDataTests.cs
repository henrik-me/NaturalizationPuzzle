using Microsoft.EntityFrameworkCore;
using NaturalizationPuzzle.Api.Data;
using NaturalizationPuzzle.Api.Models;

namespace NaturalizationPuzzle.Api.Tests;

public sealed class RepresentativeSeedDataTests : IDisposable
{
    private readonly AppDbContext _db;

    public RepresentativeSeedDataTests()
    {
        var options = new DbContextOptionsBuilder<AppDbContext>()
            .UseInMemoryDatabase(Guid.NewGuid().ToString())
            .Options;

        _db = new AppDbContext(options);
        _db.Database.EnsureCreated();
    }

    [Fact]
    public async Task SeedData_Contains435Representatives()
    {
        var count = await _db.Representatives.CountAsync();
        Assert.Equal(435, count);
    }

    [Fact]
    public async Task SeedData_Every50StatesHasAtLeastOneRepresentative()
    {
        var statesWithReps = await _db.Representatives
            .Select(r => r.StateId)
            .Distinct()
            .ToListAsync();

        var allStateIds = await _db.States
            .Select(s => s.Id)
            .ToListAsync();

        foreach (var stateId in allStateIds)
        {
            Assert.Contains(stateId, statesWithReps);
        }
    }

    [Fact]
    public async Task SeedData_HasNoDuplicateDistrictsPerState()
    {
        var duplicates = await _db.Representatives
            .GroupBy(r => new { r.StateId, r.District })
            .Where(g => g.Count() > 1)
            .Select(g => new { g.Key.StateId, g.Key.District, Count = g.Count() })
            .ToListAsync();

        Assert.Empty(duplicates);
    }

    [Fact]
    public async Task SeedData_HasUniqueIds()
    {
        var totalCount = await _db.Representatives.CountAsync();
        var uniqueIdCount = await _db.Representatives
            .Select(r => r.Id)
            .Distinct()
            .CountAsync();

        Assert.Equal(totalCount, uniqueIdCount);
    }

    [Fact]
    public async Task SeedData_AllRepresentativesHaveNonEmptyNames()
    {
        var emptyNames = await _db.Representatives
            .Where(r => string.IsNullOrWhiteSpace(r.Name))
            .ToListAsync();

        Assert.Empty(emptyNames);
    }

    [Fact]
    public async Task SeedData_AtLargeStatesHaveExactlyOneRepresentative()
    {
        // States with "At Large" district should have exactly 1 representative
        var atLargeStates = await _db.Representatives
            .Where(r => r.District == "At Large")
            .GroupBy(r => r.StateId)
            .Select(g => new { StateId = g.Key, Count = g.Count() })
            .ToListAsync();

        Assert.All(atLargeStates, s => Assert.Equal(1, s.Count));
    }

    [Theory]
    [InlineData(5, 52)]   // California
    [InlineData(43, 38)]  // Texas
    [InlineData(32, 26)]  // New York
    [InlineData(9, 28)]   // Florida
    [InlineData(2, 1)]    // Alaska (At Large)
    [InlineData(50, 1)]   // Wyoming (At Large)
    public async Task SeedData_StateHasExpectedRepresentativeCount(int stateId, int expectedCount)
    {
        var count = await _db.Representatives
            .Where(r => r.StateId == stateId)
            .CountAsync();

        Assert.Equal(expectedCount, count);
    }

    public void Dispose() => _db.Dispose();
}
