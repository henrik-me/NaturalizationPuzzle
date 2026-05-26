using Microsoft.EntityFrameworkCore;
using NaturalizationPuzzle.Api.Data;
using NaturalizationPuzzle.Api.Models;
using NaturalizationPuzzle.Api.Services;

namespace NaturalizationPuzzle.Api.Tests;

public sealed class StateServiceTests : IDisposable
{
    private readonly AppDbContext _db;
    private readonly StateService _sut;

    public StateServiceTests()
    {
        var options = new DbContextOptionsBuilder<AppDbContext>()
            .UseInMemoryDatabase(Guid.NewGuid().ToString())
            .Options;

        _db = new AppDbContext(options);
        _db.Database.EnsureCreated();
        _sut = new StateService(_db);
    }

    [Fact]
    public async Task GetAllStatesAsync_ReturnsAllStates_OrderedByName()
    {
        var states = await _sut.GetAllStatesAsync(CancellationToken.None);

        Assert.NotEmpty(states);
        var names = states.Select(s => s.Name).ToList();
        Assert.Equal(names.OrderBy(n => n).ToList(), names);
    }

    [Fact]
    public async Task GetAllStatesAsync_PopulatesRepresentativesForEachState()
    {
        var states = await _sut.GetAllStatesAsync(CancellationToken.None);

        // Every seeded state has at least one representative (at-large or otherwise).
        Assert.All(states, s => Assert.NotEmpty(s.Representatives));
    }

    [Fact]
    public async Task GetAllStatesAsync_ReturnsRepresentativesInIdOrder()
    {
        // The legacy implementation loaded all representatives and filtered by stateId
        // in memory; that produced reps in insertion (Id) order. The refactored
        // implementation must preserve that ordering so downstream UI/tests stay stable.
        var states = await _sut.GetAllStatesAsync(CancellationToken.None);
        var california = states.First(s => s.Abbreviation == "CA");

        var caRepIds = await _db.Representatives
            .Where(r => r.StateId == california.Id)
            .OrderBy(r => r.Id)
            .Select(r => r.Name)
            .ToListAsync();

        Assert.Equal(caRepIds, california.Representatives);
    }

    [Fact]
    public async Task GetAllStatesAsync_ReturnsRepresentativesInIdOrder_EvenWhenInsertedOutOfOrder()
    {
        // Seed a synthetic state with representatives inserted in a deliberately
        // non-ascending Id order. If the projection's inner OrderBy(r => r.Id) is
        // ever removed, the InMemory provider would return reps in insertion
        // order and this assertion would fail. Anchors the ordering contract
        // independently of the seed data's coincidental Id-ordered layout.
        const int syntheticStateId = 9001;
        _db.States.Add(new UsState
        {
            Id = syntheticStateId,
            Name = "ZZ Test State",
            Abbreviation = "ZZ",
            Capital = "Testopolis",
            Governor = "Test Governor",
            SenatorOne = "Test Senator A",
            SenatorTwo = "Test Senator B",
            Representative = "Test Rep",
        });
        _db.Representatives.AddRange(
            new Representative { Id = 9020, StateId = syntheticStateId, District = "3", Name = "Rep Charlie" },
            new Representative { Id = 9010, StateId = syntheticStateId, District = "1", Name = "Rep Alpha" },
            new Representative { Id = 9015, StateId = syntheticStateId, District = "2", Name = "Rep Bravo" });
        await _db.SaveChangesAsync();

        var state = await _sut.GetStateByIdAsync(syntheticStateId, CancellationToken.None);

        Assert.NotNull(state);
        Assert.Equal(new[] { "Rep Alpha", "Rep Bravo", "Rep Charlie" }, state!.Representatives);
    }

    [Fact]
    public async Task GetStateByIdAsync_ReturnsState_WhenExists()
    {
        var first = (await _sut.GetAllStatesAsync(CancellationToken.None)).First();
        var fetched = await _sut.GetStateByIdAsync(first.Id, CancellationToken.None);

        Assert.NotNull(fetched);
        Assert.Equal(first.Name, fetched.Name);
        Assert.Equal(first.Capital, fetched.Capital);
        Assert.Equal(first.Representatives, fetched.Representatives);
    }

    [Fact]
    public async Task GetStateByIdAsync_ReturnsNull_WhenNotExists()
    {
        var fetched = await _sut.GetStateByIdAsync(99999, CancellationToken.None);
        Assert.Null(fetched);
    }

    public void Dispose() => _db.Dispose();
}
