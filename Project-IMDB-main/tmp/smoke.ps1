New-Item -ItemType Directory -Force -Path .\tmp | Out-Null
$b = @{prompt='Suggest Telugu thriller movies'; limit=2} | ConvertTo-Json
Invoke-RestMethod -Uri 'http://localhost:5000/api/ai-recommend' -Method Post -Body $b -ContentType 'application/json' | ConvertTo-Json -Depth 10 | Out-File -Encoding utf8 .\tmp\ai_recommend.json
Invoke-RestMethod -Uri 'http://localhost:5000/api/search?q=batman' -Method Get | ConvertTo-Json -Depth 10 | Out-File -Encoding utf8 .\tmp\search_batman.json
Invoke-RestMethod -Uri 'http://localhost:5000/api/movie/550' -Method Get | ConvertTo-Json -Depth 10 | Out-File -Encoding utf8 .\tmp\movie_550.json
Write-Output 'SMOKE_SCRIPT_DONE'