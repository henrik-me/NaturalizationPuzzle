using System.Net;
using System.Text.Json;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Hosting;

namespace NaturalizationPuzzle.Api.Tests;

public sealed class RepresentativesEndpointTests : IClassFixture<RepresentativesEndpointTests.Factory>, IDisposable
{
    private readonly Factory _factory;

    public RepresentativesEndpointTests(Factory factory)
    {
        _factory = factory;
    }

    [Fact]
    public async Task GetRepresentatives_BareUrl_Returns200JsonArray_NotSpaFallback()
    {
        using var client = _factory.CreateClient();

        var response = await client.GetAsync("/api/v1/representatives");

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.NotNull(response.Content.Headers.ContentType);
        Assert.StartsWith("application/json", response.Content.Headers.ContentType!.MediaType,
            StringComparison.OrdinalIgnoreCase);

        var payload = await response.Content.ReadAsStringAsync();
        using var doc = JsonDocument.Parse(payload);
        Assert.Equal(JsonValueKind.Array, doc.RootElement.ValueKind);
        Assert.True(doc.RootElement.GetArrayLength() > 0, "expected non-empty representatives array");
    }

    public void Dispose() => _factory.Dispose();

    public sealed class Factory : WebApplicationFactory<Program>
    {
        private readonly string _dbPath = Path.Combine(
            Path.GetTempPath(),
            $"naturalization-endpoint-tests-{Guid.NewGuid():N}.db");

        protected override IHost CreateHost(IHostBuilder builder)
        {
            builder.UseEnvironment("Production");
            builder.ConfigureHostConfiguration(config =>
            {
                config.AddInMemoryCollection(new Dictionary<string, string?>
                {
                    ["ConnectionStrings:DefaultConnection"] = $"Data Source={_dbPath}",
                });
            });
            return base.CreateHost(builder);
        }

        protected override void Dispose(bool disposing)
        {
            base.Dispose(disposing);
            try { if (File.Exists(_dbPath)) File.Delete(_dbPath); } catch { /* best-effort cleanup */ }
        }
    }
}

