using Microsoft.EntityFrameworkCore;
using NaturalizationPuzzle.Api.Data;
using NaturalizationPuzzle.Api.Endpoints;
using NaturalizationPuzzle.Api.Middleware;
using NaturalizationPuzzle.Api.Services;

var builder = WebApplication.CreateBuilder(args);

builder.Services.AddDbContext<AppDbContext>(options =>
    options.UseSqlite(builder.Configuration.GetConnectionString("DefaultConnection")
        ?? "Data Source=naturalization.db"));

builder.Services.AddScoped<IQuestionService, QuestionService>();
builder.Services.AddScoped<IStateService, StateService>();
builder.Services.AddScoped<IQuizService, QuizService>();
builder.Services.AddScoped<IRepresentativeService, RepresentativeService>();

builder.Services.AddExceptionHandler<GlobalExceptionHandler>();
builder.Services.AddProblemDetails();

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
    await db.Database.EnsureCreatedAsync();
}

app.Run();

public partial class Program { }
