from enum import IntEnum

class uploadStatus(IntEnum):
    URL_REQUESTED = 0
    PROCESSING = 1
    SUCCESSFUL = 2
    FAILED = -1

class ProcessingError(Exception):

    def __init__(self, message = "Unable to process video!"):
        self.message = message
        super().__init__(self.message)