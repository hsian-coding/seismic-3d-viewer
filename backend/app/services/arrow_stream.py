import io
from typing import Iterable, Iterator

import pyarrow as pa


ARROW_STREAM_MEDIA_TYPE = "application/vnd.apache.arrow.stream"


def record_batches_to_ipc(batches: Iterable[pa.RecordBatch], schema: pa.Schema) -> Iterator[bytes]:
    """Serialize record batches incrementally as one valid Arrow IPC stream."""
    sink = io.BytesIO()
    emitted = 0
    writer = pa.ipc.new_stream(sink, schema)

    def pending_bytes() -> bytes:
        nonlocal emitted
        end = sink.tell()
        sink.seek(emitted)
        payload = sink.read(end - emitted)
        sink.seek(end)
        emitted = end
        return payload

    header = pending_bytes()
    if header:
        yield header

    for batch in batches:
        writer.write_batch(batch)
        payload = pending_bytes()
        if payload:
            yield payload

    writer.close()
    footer = pending_bytes()
    if footer:
        yield footer
