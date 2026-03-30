package com.assistant.testing_not_for_ai;

import java.util.ArrayList;
import java.util.List;

public class Engine {
    public class AActor extends UObject {
        private final UWorld world;
        public UWorld getWorld() {
            return world;
        }
        public AActor(UWorld world) {
            this.world = world;
        }
    }

    public class UDataAsset extends UObject {

    }

    public class UActorComponent extends UObject {

    }

    public class UObject {

    }

    public class FStruct {

    }

    public class UWorld extends UObject {
        private final List<AActor> actors = new ArrayList<>();
        public <T extends AActor> T spawnActor(Class<T> actorClass) {
            try {
                T actor = actorClass.getDeclaredConstructor(UWorld.class).newInstance(this);
                actors.add(actor);
                return actor;
            } catch (Exception e) {
                throw new RuntimeException("Failed to spawn actor", e);
            }
        }
        public List<AActor> getActors() {
            return new ArrayList<>(actors);
        }
    }
}


