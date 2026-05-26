was ist hiermit:

GameMode#BeginPlay() {
LoadSzenario(FindAsset('default_szenario'), GameState);
}

void LoadSzenario(Szenario* szenarioToLoad, GameState* gameState) {
InitCharacters(szenarioToLoad->GetCharacters(), gameState->CharacterInfos)
}

void InitCharacters (const TArray<CharacterAssets\*>& assets, TArray<FCharacterInfo>& OutInfos) {
OutInfo.SetNum(assets.Num())
for (int32 I = 0; I < assets.Num()) {
InitCharacter(assets[I], OutInfo[I]);
}
}

void InitCharacter (CharacterAsset\* asset, FCharacterInfo& OutInfo) {
OutInfo.Name = asset->Name;
}
