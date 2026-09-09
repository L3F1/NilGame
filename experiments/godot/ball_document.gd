extends RefCounted
## Small native adapter for the ball-lab subset of scene v1. No Godot physics.
## Invalid edits/loads leave the last valid document intact.

var data: Dictionary = {}
var error := ""

func _fields(value: Variant, names: Array) -> bool:
	if not value is Dictionary or value.size() != names.size():
		return false
	for key in names:
		if not value.has(key): return false
	return true

func _positive(value: Variant) -> bool:
	return (value is float or value is int) and is_finite(float(value)) and value > 0

func _vector(value: Variant) -> bool:
	if not value is Array or value.size() != 3: return false
	for item in value:
		if not (item is float or item is int) or not is_finite(float(item)): return false
	return true

func _id(value: Variant, ids: Array) -> bool:
	if not value is String or value in ids: return false
	var expression := RegEx.new()
	expression.compile("^[a-z][a-z0-9_-]*$")
	if expression.search(value) == null: return false
	ids.append(value)
	return true

func _valid(source: Variant) -> bool:
	if not _fields(source, ["format", "version", "id", "units", "regions", "entities", "connections"]): return false
	if source.format != "nil-scene" or source.version != 1: return false
	var ids: Array = []
	if not _id(source.id, ids): return false
	if not _fields(source.units, ["name", "playerRadius"]): return false
	if source.units.name != "design-unit" or not _positive(source.units.playerRadius): return false
	if not source.regions is Array or source.regions.size() != 1: return false
	if not source.entities is Array or source.entities.size() != 2: return false
	if not source.connections is Array or not source.connections.is_empty(): return false
	var region: Variant = source.regions[0]
	if not _fields(region, ["id", "geometry", "topology", "extent"]): return false
	if not _id(region.id, ids) or region.topology != "cover" or not _positive(region.extent): return false
	if not _fields(region.geometry, ["kind", "curvatureRadius"]): return false
	if region.geometry.kind != "e3" or not _positive(region.geometry.curvatureRadius): return false
	var kinds: Array = []
	for entity in source.entities:
		if not entity is Dictionary: return false
		var kind: Variant = entity.get("kind")
		if kind not in ["ball", "spawn"] or kind in kinds: return false
		kinds.append(kind)
		var allowed := ["id", "kind", "regionId", "position"]
		if kind == "ball": allowed.append("radius")
		if not _fields(entity, allowed) or not _id(entity.id, ids): return false
		if entity.regionId != region.id or not _vector(entity.position): return false
		var clearance: float = source.units.playerRadius
		if kind == "ball":
			if not _positive(entity.radius): return false
			clearance = entity.radius
		var p: Array = entity.position
		# Document bounds use scalar doubles, not the host's float32 Vector3.
		if sqrt(p[0]*p[0] + p[1]*p[1] + p[2]*p[2]) + clearance > region.extent: return false
	return true

func replace(source: Variant) -> bool:
	if not _valid(source):
		error = "Expected scene v1: one E3 cover, one spawn, one ball within its extent; no extra fields or connections."
		return false
	data = source.duplicate(true)
	error = ""
	return true

func ball() -> Dictionary:
	for entity in data.entities:
		if entity.kind == "ball": return entity
	return {}

func parameters() -> Vector4:
	var entity := ball()
	return Vector4(entity.position[0], entity.position[1], entity.position[2], entity.radius)

func distance_to(point: Vector3) -> float:
	var value := parameters()
	return point.distance_to(Vector3(value.x, value.y, value.z)) - value.w

func edited(value: Array) -> Dictionary:
	var next := data.duplicate(true)
	for entity in next.entities:
		if entity.kind == "ball":
			entity.position = value.slice(0, 3)
			entity.radius = value[3]
	return next

func load_file(path: String) -> bool:
	var file := FileAccess.open(path, FileAccess.READ)
	if file == null:
		error = "Cannot read " + path
		return false
	return replace(JSON.parse_string(file.get_as_text()))

func save_file(path: String) -> bool:
	var file := FileAccess.open(path, FileAccess.WRITE)
	if file == null:
		error = "Cannot write " + path
		return false
	file.store_string(JSON.stringify(data, "  ", true, true))
	file.flush()
	if file.get_error() != OK:
		error = "Write failed: " + path
		return false
	error = ""
	return true
