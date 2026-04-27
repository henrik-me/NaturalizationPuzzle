using Azure.Monitor.OpenTelemetry.AspNetCore;
using Microsoft.EntityFrameworkCore;
using NaturalizationPuzzle.Api.Data;
using NaturalizationPuzzle.Api.Endpoints;
using NaturalizationPuzzle.Api.Logging;
using NaturalizationPuzzle.Api.Middleware;
using NaturalizationPuzzle.Api.Services;

var builder = WebApplication.CreateBuilder(args);

if (!string.IsNullOrEmpty(builder.Configuration["APPLICATIONINSIGHTS_CONNECTION_STRING"]))
{
    builder.Services.AddOpenTelemetry().UseAzureMonitor();
}

builder.Services.AddDbContext<AppDbContext>(options =>
    options.UseSqlite(builder.Configuration.GetConnectionString("DefaultConnection")
        ?? "Data Source=naturalization.db"));

builder.Services.AddScoped<IQuestionService, QuestionService>();
builder.Services.AddScoped<IStateService, StateService>();
builder.Services.AddScoped<IQuizService, QuizService>();
builder.Services.AddScoped<IRepresentativeService, RepresentativeService>();

builder.Services.AddExceptionHandler<GlobalExceptionHandler>();
builder.Services.AddProblemDetails();
builder.Services.Configure<ExceptionLoggingOptions>(
    builder.Configuration.GetSection(ExceptionLoggingOptions.SectionName));

builder.Services.AddOpenApi();
builder.Services.AddCors(options =>
{
    options.AddDefaultPolicy(policy =>
    {
        policy.WithOrigins("https://localhost:5173", "http://localhost:5173")
              .AllowAnyHeader()
              .AllowAnyMethod();
    });
});

var app = builder.Build();

if (app.Environment.IsDevelopment())
{
    app.MapOpenApi();
}

app.UseExceptionHandler();
app.UseCors();

if (app.Environment.IsDevelopment())
{
    app.UseHttpsRedirection();
}

app.UseDefaultFiles();
app.UseStaticFiles();

app.MapQuestionEndpoints();
app.MapStateEndpoints();
app.MapQuizEndpoints();
app.MapRepresentativeEndpoints();
app.MapHealthEndpoints();
app.MapFallbackToFile("index.html");

using (var scope = app.Services.CreateScope())
{
    var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
    var logger = scope.ServiceProvider.GetRequiredService<ILogger<Program>>();
    await EnsureDatabaseSchemaAsync(db, logger);
}

app.Run();

// One-time recovery for SQLite databases created before the Question.Tags column
// was added. The project uses EnsureCreatedAsync (no migrations), so a pre-existing
// DB file will silently keep the old schema and queries on Tags will fail at read.
// Since all data is read-only seed (no user state lives server-side), the safe
// recovery is to drop and recreate when a known column is missing.
//
// This block can be removed once migrations are introduced (tracked separately).
static async Task EnsureDatabaseSchemaAsync(AppDbContext db, ILogger logger)
{
    if (await db.Database.CanConnectAsync())
    {
        var conn = db.Database.GetDbConnection();
        await conn.OpenAsync();
        try
        {
            await using var cmd = conn.CreateCommand();
            cmd.CommandText = "SELECT name FROM sqlite_master WHERE type='table' AND name='Questions';";
            var hasQuestions = await cmd.ExecuteScalarAsync() is not null;
            if (hasQuestions)
            {
                cmd.CommandText = "SELECT COUNT(*) FROM pragma_table_info('Questions') WHERE name='Tags';";
                var tagsColumnCount = Convert.ToInt32(await cmd.ExecuteScalarAsync() ?? 0);
                if (tagsColumnCount == 0)
                {
                    logger.LogWarning("Existing database is missing the Questions.Tags column; dropping and recreating with fresh seed data.");
                    await conn.CloseAsync();
                    await db.Database.EnsureDeletedAsync();
                }
            }
        }
        finally
        {
            if (conn.State == System.Data.ConnectionState.Open)
            {
                await conn.CloseAsync();
            }
        }
    }

    await db.Database.EnsureCreatedAsync();
}

public partial class Program { }
