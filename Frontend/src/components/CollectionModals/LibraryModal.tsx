import { useLibrary } from "@/context/useLibrary";
import IngestModal from "./CollectionComponents/Ingest";
import AddLibrary from "./CollectionComponents/AddLibrary";
import DataStoreSelect from "./CollectionComponents/DataStoreSelect";

export function LibraryModal() {
  const { selectedCollection, showUpload, setShowUpload, showAddStore } =
    useLibrary();

  return (
    <div className="space-y-8">
      <div className="space-y-6">
        {showUpload && selectedCollection?.id !== 0 ? (
          <IngestModal setShowUpload={setShowUpload} />
        ) : (
          <div className="space-y-6">
            <div className="rounded-[6px] p-4 bg-gradient-to-br from-secondary/50 via-secondary/30 to-background border">
              {!showAddStore && <DataStoreSelect />}
              {showAddStore && <AddLibrary />}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
