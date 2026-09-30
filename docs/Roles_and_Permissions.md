Lab Manager Stories
Models
	User
	ChemicalStorageCategory
	Chemical
	SDS
	LocationType
	Location
	Container
	WeightReading
	CheckoutEvent
	ElevationRequest
User Categories (Inherit all permission from previously listed groups unless specifically specified)
	Non-members (Anyone without a @lipscomb.edu or @mail.lipscomb.edu email)
		Permissions:
			SDS - Read
	Members (Anyone with a lipscomb.edu email but no account)
		Permissions:
			User - Create (self, Unique)			
	Guests (Non staff accounts)
		Permissions:			
			Elevation Request - Create
			User - Read (self, detail only)
	Staff	(Staff accounts)
		Student Worker
			Permissions:
				Chemical - Read (list & detail)
				Container - Read (list & detail)				
		Stockroom Worker
			Permissions:
				ChemicalStorageCategory - Read (list & detail)
				LocationType - Read (list & detail)
				Location - Create, Read (list & detail), Update
				Container - Update (location only)
				WeightReading - Create, Read (detail)
				CheckoutEvent - Create, Read (list & detail)
		Coordinator
			Permissions:
				Chemical - Create, Update
				SDS - Create, Read (list), Update
				LocationType - Create, Update
				Location - Delete
				Container - Create, Update (full)
		Lab Manager
			Permissions:
				Users - Create, Read (list, detail), Update, Delete
				ChemicalStorageCateogry - Create, Update, Delete
				Chemical - Delete
				SDS - Delete
				LocationType - Delete
				Container - Delete
				WeightReading - Read (detail, list)
				ElevationRequest - Read(detail, list), Update
				
		Admin
			Permissions:
				All