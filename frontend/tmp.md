ich könnte anlegen:

enum ETask {
    A, B, C
}

class CharacterContainer {
    TArray<FCharacterInfo> Infos; // very rarely changing states
    TArray<int32> Food;
    TArray<int32> Energy;
    TArray<ETask> Tasks;

    // Procedural Part
    void RunSim (int32 DeltaTime) {
        for (int32 I = 0; I < Infos.Num(); ++I)
        {
            RunSimForCharacterWithIndex(I, DeltaTime);
        }
    }

    void RunSimForCharacterWithIndex (int32 CharacterIndex, int32 DeltaTime) {
        Sim::Character(Food[I], Energy[I], Tasks[I], DeltaTime);
    }

}

namespace Task
{
    float FoodCost (const ETask& Task) {
        if (Task == A) return 2;
        if (Task == B) return 4;
        return 6;
    }

    float EnergyCost (const ETask& Task) {
        if (Task == A) return 1;
        if (Task == B) return 2;
        return 3;
    }
}

namespace Sim 
{
    void Character (int32& Food, int32& Energy, ETask& Task, int32 DeltaTime)
    {
        Sim::FoodAndEnergy(Food, Energy, Task);
        Sim::
    }

    void FoodAndEnergy (int32& Food, int32& Energy, const ETask& Task, int32 DeltaTime) {
        Food = ClampMin(0, Food - Task::FoodCost(Task) * DeltaTime);
        Energy = ClampMin(0, Energy - Task::EnergyCost(Task) * DeltaTime);
    }

    void assignNewTask(const int32& Food, const int32& Energy, const ETask&) {

    }
}
