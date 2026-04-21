# Stage 1: Build frontend
FROM node:25-alpine AS frontend-build
WORKDIR /app/client
COPY src/client/package*.json ./
RUN npm ci
COPY src/client/ ./
RUN npm run build

# Stage 2: Build and publish backend
FROM mcr.microsoft.com/dotnet/sdk:10.0 AS backend-build
WORKDIR /app
COPY src/api/NaturalizationPuzzle.Api.csproj src/api/
RUN dotnet restore src/api/NaturalizationPuzzle.Api.csproj
COPY src/api/ src/api/
COPY --from=frontend-build /app/client/dist/ src/api/wwwroot/
RUN dotnet publish src/api/NaturalizationPuzzle.Api.csproj -c Release -o /publish --no-restore

# Stage 3: Runtime
FROM mcr.microsoft.com/dotnet/aspnet:10.0
WORKDIR /app
COPY --from=backend-build /publish .

ENV ASPNETCORE_URLS=http://+:8080
ENV ASPNETCORE_ENVIRONMENT=Production
EXPOSE 8080

ENTRYPOINT ["dotnet", "NaturalizationPuzzle.Api.dll"]
