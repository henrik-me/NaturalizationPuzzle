using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;
using NaturalizationPuzzle.Api.Data;
using NaturalizationPuzzle.Api.Models;
using NaturalizationPuzzle.Api.Services;

namespace NaturalizationPuzzle.Api.Tests;

/// <summary>
/// SQLite-backed tests for <see cref="StateService"/>. The service uses a
/// correlated subquery inside a projection (see <c>GetAllStatesAsync</c>),
/// which the EF InMemory provider would not actually validate against real
/// SQL translation. Using SQLite in-memory (matching the
/// <c>QuestionTagsPersistenceTests</c> pattern) ensures the query both
/// translates and executes correctly against the same provider production uses.
/// </summary>
public sealed class StateServiceTests : IDisposable
{
    private readonly SqliteConnection _connection;
    private readonly AppDbContext _db;
    private readonly StateService _sut;

    public StateServiceTests()
    {
        _connection = new SqliteConnection("DataSource=:memory:");
        _connection.Open();

        var options = new DbContextOptionsBuilder<AppDbContext>()
            .UseSqlite(_connection)
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
        // SQLite's default TEXT collation is BINARY (ordinal byte comparison),
        // so the assertion must use StringComparer.Ordinal to match what the
        // service's ORDER BY actually produces — not LINQ's current-culture default.
        Assert.Equal(names.OrderBy(n => n, StringComparer.Ordinal).ToList(), names);
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

        var caRepNames = await _db.Representatives
            .Where(r => r.StateId == california.Id)
            .OrderBy(r => r.Id)
            .Select(r => r.Name)
            .ToListAsync();

        Assert.Equal(caRepNames, california.Representatives);
    }

    [Fact]
    public async Task GetAllStatesAsync_ReturnsRepresentativesInIdOrder_EvenWhenInsertedOutOfOrder()
    {
        // Seed a synthetic state with representatives inserted in deliberately
        // non-ascending Id order. Without the projection's inner OrderBy(r => r.Id),
        // SQLite's default row ordering for an unindexed correlated subquery is
        // not guaranteed to be ascending by Id, so removing the OrderBy would
        // surface here. Anchors the ordering contract independently of any
        // coincidental Id-ordered layout in the seed data.
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

        var allStates = await _sut.GetAllStatesAsync(CancellationToken.None);
        var state = allStates.FirstOrDefault(s => s.Abbreviation == "ZZ");

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

    public void Dispose()
    {
        _db.Dispose();
        _connection.Dispose();
    }
}
